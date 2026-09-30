'use client';

import React, { useRef, useState } from 'react';
import { useAction, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import {
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Chip,
  Code,
  Divider,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Tab,
  Tabs,
  Tooltip,
  useDisclosure,
} from '@heroui/react';
import {
  AlertCircle,
  CheckCircle2,
  Code as CodeIcon,
  Edit,
  Eye,
  FileCode2,
  FileJson2,
  FolderOpen,
  Image,
  PackageOpen,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { PluginIcon } from '@/components/plugin-icon';
import { appModalClassNames } from '@/components/app-dialogs';

interface PageProps {
  username?: string;
  userData?: Record<string, unknown>;
}

interface UploadedFile {
  file: File;
  base64: string;
  isValid: boolean;
  error?: string;
}

interface Plugin {
  _id: string;
  name: string;
  author: string;
  version: string;
  description?: string;
  isActive: boolean;
  uploadDate: number;
  iconFileId?: string;
  iconLightFileId?: string;
  iconDarkFileId?: string;
}

interface PluginAsset {
  name: string;
  content: string;
  mimeType?: string;
}

type UploadKind = 'manifest' | 'core' | 'icon' | 'iconLight' | 'iconDark';

const uploadLabels: Record<UploadKind, string> = {
  manifest: 'Manifest',
  core: 'Core logic',
  icon: 'Default icon',
  iconLight: 'Light icon',
  iconDark: 'Dark icon',
};

export const PluginPublisherPage: React.FC<PageProps> = () => {
  const [activeTab, setActiveTab] = useState('upload');
  const [pluginData, setPluginData] = useState<{
    name: string;
    author: string;
    version: string;
    description: string;
  } | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<Partial<Record<UploadKind, UploadedFile>>>({});
  const [pluginAssets, setPluginAssets] = useState<PluginAsset[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [editingPlugin, setEditingPlugin] = useState<Plugin | null>(null);
  const [ingestActive, setIngestActive] = useState(false);
  const [pluginToDelete, setPluginToDelete] = useState<Plugin | null>(null);
  const [pluginToPreview, setPluginToPreview] = useState<Plugin | null>(null);

  const folderInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { isOpen: isDeleteModalOpen, onOpen: onDeleteModalOpen, onClose: onDeleteModalClose } = useDisclosure();
  const { isOpen: isPreviewModalOpen, onOpen: onPreviewModalOpen, onClose: onPreviewModalClose } = useDisclosure();

  const uploadPluginAction = useAction((api.context as any).uploadPluginAction);
  const deletePluginAction = useAction((api.context as any).deletePluginAction);
  const allPlugins = useQuery(api.context.getAllPlugins) as Plugin[] | undefined;

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.readAsDataURL(file);
    });
  };

  const validateFileContent = async (file: File, type: UploadKind): Promise<{ isValid: boolean; error?: string }> => {
    try {
      const content = await file.text();

      if (type === 'manifest') {
        const manifest = JSON.parse(content);
        if (!manifest.name || !manifest.version || !manifest.author) {
          return { isValid: false, error: 'Manifest must contain name, version, and author fields.' };
        }
      }

      if (type === 'core') {
        if (!content.includes('function') && !content.includes('const') && !content.includes('class') && !content.includes('export')) {
          return { isValid: false, error: 'Core file must contain valid JavaScript code.' };
        }
      }

      if (type.includes('icon')) {
        if (!content.includes('<svg') || !content.includes('</svg>')) {
          return { isValid: false, error: 'Icon file must be a valid SVG.' };
        }
      }

      return { isValid: true };
    } catch (error) {
      return { isValid: false, error: `Invalid file format: ${error}` };
    }
  };

  const applyDetectedFile = async (file: File, type: UploadKind) => {
    const validation = await validateFileContent(file, type);
    if (!validation.isValid) {
      setUploadStatus({ type: 'error', message: validation.error || 'Invalid file.' });
      return;
    }

    const base64 = await fileToBase64(file);
    setUploadedFiles((prev) => ({ ...prev, [type]: { file, base64, isValid: true } }));

    if (type === 'manifest') {
      try {
        const manifest = JSON.parse(await file.text());
        setPluginData({
          name: manifest.name || '',
          author: manifest.author || '',
          version: manifest.version || '',
          description: manifest.description || '',
        });
      } catch {
      }
    }
  };

  const processSelectedFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    let manifestFile: File | null = null;
    let coreFile: File | null = null;
    let iconLightFile: File | null = null;
    let iconDarkFile: File | null = null;
    let legacyIconFile: File | null = null;
    const assets: PluginAsset[] = [];

    setIngestActive(true);
    setUploadStatus({ type: 'info', message: `Scanning ${fileArray.length} files...` });

    for (const file of fileArray) {
      const filePath = ((file as any).webkitRelativePath || file.name).replaceAll('\\', '/');
      const lower = file.name.toLowerCase();

      if (filePath.includes('/assets/') || filePath.startsWith('assets/')) {
        const base64 = await fileToBase64(file);
        const relativeName = filePath.includes('assets/') ? filePath.split('assets/').pop() || file.name : file.name;
        assets.push({ name: relativeName, content: base64, mimeType: file.type });
      } else if (lower === 'manifest.json') {
        manifestFile = file;
      } else if (lower === 'core.js') {
        coreFile = file;
      } else if (lower.includes('icon') && lower.includes('light') && lower.endsWith('.svg')) {
        iconLightFile = file;
      } else if (lower.includes('icon') && lower.includes('dark') && lower.endsWith('.svg')) {
        iconDarkFile = file;
      } else if (lower.includes('icon') && lower.endsWith('.svg')) {
        legacyIconFile = file;
      } else if (file.type && !lower.endsWith('.json') && !lower.endsWith('.js')) {
        const base64 = await fileToBase64(file);
        assets.push({ name: file.name, content: base64, mimeType: file.type });
      }
    }

    if (manifestFile) await applyDetectedFile(manifestFile, 'manifest');
    if (coreFile) await applyDetectedFile(coreFile, 'core');
    if (iconLightFile) await applyDetectedFile(iconLightFile, 'iconLight');
    if (iconDarkFile) await applyDetectedFile(iconDarkFile, 'iconDark');
    if (legacyIconFile && !iconLightFile && !iconDarkFile) await applyDetectedFile(legacyIconFile, 'icon');

    setPluginAssets(assets);

    const detectedCount = [manifestFile, coreFile, iconLightFile, iconDarkFile, !iconLightFile && !iconDarkFile ? legacyIconFile : null].filter(Boolean).length;
    setUploadStatus({
      type: 'success',
      message: `Sorted ${detectedCount} core files and ${assets.length} asset${assets.length === 1 ? '' : 's'}.`,
    });
    setIngestActive(false);
  };

  const handleAssetRemove = (index: number) => {
    setPluginAssets((prev) => prev.filter((_, currentIndex) => currentIndex !== index));
  };
  const handleUpload = async () => {
    const hasAnyIcon = uploadedFiles.icon || uploadedFiles.iconLight || uploadedFiles.iconDark;
    if (!uploadedFiles.manifest || !uploadedFiles.core || !hasAnyIcon || !pluginData) {
      setUploadStatus({ type: 'error', message: 'Manifest, core, and at least one icon are required.' });
      return;
    }

    setIsUploading(true);
    try {
      await uploadPluginAction({
        pluginName: pluginData.name,
        author: pluginData.author,
        version: pluginData.version,
        description: pluginData.description,
        manifestFile: uploadedFiles.manifest.base64,
        coreFile: uploadedFiles.core.base64,
        iconFile: uploadedFiles.icon?.base64,
        iconLightFile: uploadedFiles.iconLight?.base64,
        iconDarkFile: uploadedFiles.iconDark?.base64,
        assets: pluginAssets,
      });
      setUploadStatus({ type: 'success', message: editingPlugin ? `Plugin "${pluginData.name}" updated.` : `Plugin "${pluginData.name}" published.` });
      resetForm();
    } catch (error) {
      setUploadStatus({ type: 'error', message: `Upload failed: ${error}` });
    } finally {
      setIsUploading(false);
    }
  };

  const resetForm = () => {
    setPluginData(null);
    setUploadedFiles({});
    setPluginAssets([]);
    setEditingPlugin(null);
    setUploadStatus(null);
    if (folderInputRef.current) folderInputRef.current.value = '';
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleEditPlugin = (plugin: Plugin) => {
    setEditingPlugin(plugin);
    setPluginData({
      name: plugin.name,
      author: plugin.author,
      version: plugin.version,
      description: plugin.description || '',
    });
    setActiveTab('upload');
    setUploadStatus({ type: 'info', message: `Editing "${plugin.name}". Load a fresh bundle or replacement files, then publish to update it.` });
  };

  const confirmDelete = async () => {
    if (!pluginToDelete) return;
    try {
      await deletePluginAction({ pluginName: pluginToDelete.name });
      setUploadStatus({ type: 'success', message: `Plugin "${pluginToDelete.name}" deleted.` });
    } catch (error) {
      setUploadStatus({ type: 'error', message: `Failed to delete plugin: ${error}` });
    } finally {
      setPluginToDelete(null);
      onDeleteModalClose();
    }
  };

  const requiredChecklist = [
    { key: 'manifest', label: 'manifest.json', ready: Boolean(uploadedFiles.manifest), icon: <FileJson2 size={16} /> },
    { key: 'core', label: 'core.js', ready: Boolean(uploadedFiles.core), icon: <FileCode2 size={16} /> },
    { key: 'icon', label: 'icon set', ready: Boolean(uploadedFiles.icon || uploadedFiles.iconLight || uploadedFiles.iconDark), icon: <Image size={16} /> },
    { key: 'assets', label: 'assets folder', ready: pluginAssets.length > 0, icon: <PackageOpen size={16} /> },
  ];

  const readyToPublish = Boolean(uploadedFiles.manifest && uploadedFiles.core && (uploadedFiles.icon || uploadedFiles.iconLight || uploadedFiles.iconDark) && pluginData);
  const detectedFiles = (Object.entries(uploadedFiles) as Array<[UploadKind, UploadedFile | undefined]>).filter(([, file]) => Boolean(file));

  return (
    <div className="mx-auto flex h-[calc(100vh-9rem)] min-h-0 max-w-7xl flex-col gap-4 overflow-hidden px-4 py-4 md:px-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Plugin Publisher</h1>
          <p className="text-sm text-default-500">Upload, update, and manage dashboard plugins.</p>
        </div>
        <Chip variant="flat" color="primary" className="font-semibold">{allPlugins?.length || 0} Plugins</Chip>
      </div>

      <div className="flex items-center gap-2">
        <Button
          color={activeTab === 'upload' ? 'primary' : 'default'}
          variant={activeTab === 'upload' ? 'solid' : 'flat'}
          startContent={<Upload size={16} />}
          className="rounded-xl px-4 font-medium"
          onPress={() => setActiveTab('upload')}
        >
          Publish
        </Button>
        <Button
          color={activeTab === 'manage' ? 'primary' : 'default'}
          variant={activeTab === 'manage' ? 'solid' : 'flat'}
          startContent={<CodeIcon size={16} />}
          className="rounded-xl px-4 font-medium"
          onPress={() => setActiveTab('manage')}
        >
          Marketplace
        </Button>
      </div>
      <Tabs
        aria-label="Plugin management"
        color="primary"
        variant="solid"
        selectedKey={activeTab}
        onSelectionChange={(key) => setActiveTab(String(key))}
        className="min-h-0 flex-1 overflow-hidden"
        classNames={{
          base: 'flex h-full min-h-0 flex-col overflow-hidden',
          tabList: 'hidden',
          cursor: 'rounded-xl bg-primary shadow-none',
          tab: 'h-10 px-4 data-[hover-unselected=true]:opacity-100',
          tabContent: 'text-default-600 group-data-[selected=true]:text-primary-foreground',
          panel: 'h-full overflow-hidden p-0',
        }}
      >
        <Tab key="upload" title={<div className="flex items-center gap-2 px-2"><Upload size={18} /><span>Publish</span></div>}>
          <div className="grid h-full min-h-0 grid-cols-[minmax(0,1.4fr)_360px] gap-4 overflow-hidden">
            <Card className="flex h-full min-h-0 flex-col border border-default-200 bg-content1 shadow-sm">
              <CardHeader className="flex items-center justify-between gap-3 pb-3">
                <div>
                  <div className="text-lg font-semibold">{editingPlugin ? `Update: ${editingPlugin.name}` : 'Upload Bundle'}</div>
                  <div className="text-sm text-default-500">Upload a whole folder or select files from one. We will sort them automatically.</div>
                </div>
                {editingPlugin && (
                  <Button variant="flat" size="sm" startContent={<X size={14} />} onClick={resetForm}>
                    Clear edit mode
                  </Button>
                )}
              </CardHeader>
              <Divider />
              <CardBody className="min-h-0 space-y-4 overflow-auto py-4">
                <div className="grid grid-cols-2 gap-3">
                  <Button color="primary" size="lg" startContent={<FolderOpen size={18} />} onPress={() => folderInputRef.current?.click()}>
                    Upload Folder
                  </Button>
                  <Button variant="flat" size="lg" startContent={<Upload size={18} />} onPress={() => fileInputRef.current?.click()}>
                    Select Files
                  </Button>
                </div>

                <div
                  className={`flex min-h-[220px] items-center justify-center rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
                    ingestActive ? 'border-primary bg-primary/5' : 'border-default-200 bg-default-50 hover:border-default-300'
                  }`}
                  onDragEnter={(event) => { event.preventDefault(); setIngestActive(true); }}
                  onDragLeave={(event) => { event.preventDefault(); setIngestActive(false); }}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    setIngestActive(false);
                    processSelectedFiles(event.dataTransfer.files);
                  }}
                >
                  <div className="space-y-4">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <PackageOpen size={28} />
                    </div>
                    <div>
                      <div className="text-base font-semibold">Drop plugin files here</div>
                      <div className="mt-1 text-sm text-default-500">Supported detection: `manifest.json`, `core.js`, `icon-light.svg`, `icon-dark.svg`, default icon, and `assets/`.</div>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-default-500">
                      <Chip size="sm" variant="flat">JSON</Chip>
                      <Chip size="sm" variant="flat">JS</Chip>
                      <Chip size="sm" variant="flat">SVG</Chip>
                      <Chip size="sm" variant="flat">assets/</Chip>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-default-200 bg-content2/40 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold">Asset files</div>
                    {pluginAssets.length > 0 && (
                      <Chip size="sm" variant="flat">
                        {pluginAssets.length}
                      </Chip>
                    )}
                  </div>
                  <div className="max-h-[180px] space-y-2 overflow-auto pr-1">
                    {pluginAssets.length === 0 ? (
                      <div className="rounded-lg border border-default-200 bg-content1 px-3 py-4 text-sm text-default-400">No assets detected yet.</div>
                    ) : (
                      pluginAssets.map((asset, index) => (
                        <div key={`${asset.name}-${index}`} className="flex items-center justify-between gap-3 rounded-lg border border-default-200 bg-content1 px-3 py-2">
                          <div className="min-w-0 truncate text-sm">{asset.name}</div>
                          <Button isIconOnly size="sm" variant="light" color="danger" onPress={() => handleAssetRemove(index)}>
                            <X size={12} />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

              </CardBody>
              <CardFooter className="justify-end gap-3 border-t border-default-200">
                <Button color={editingPlugin ? 'warning' : 'primary'} size="lg" isLoading={isUploading} isDisabled={!readyToPublish} startContent={!isUploading && <CheckCircle2 size={18} />} onPress={handleUpload}>
                  {isUploading ? 'Publishing...' : editingPlugin ? 'Update Plugin' : 'Publish Plugin'}
                </Button>
              </CardFooter>
            </Card>

            <Card className="flex h-full min-h-0 flex-col border border-default-200 bg-content1 shadow-sm">
              <CardHeader className="pb-3">
                <div>
                  <div className="text-lg font-semibold">Detected Data</div>
                  <div className="text-sm text-default-500">Live summary of what will be uploaded.</div>
                </div>
              </CardHeader>
              <Divider />
              <CardBody className="min-h-0 space-y-4 overflow-auto py-4">
                {uploadStatus && (
                  <div className={`rounded-xl border px-4 py-3 text-sm ${
                    uploadStatus.type === 'success'
                      ? 'border-success/20 bg-success/10 text-success'
                      : uploadStatus.type === 'error'
                        ? 'border-danger/20 bg-danger/10 text-danger'
                        : 'border-primary/20 bg-primary/10 text-primary'
                  }`}>
                    {uploadStatus.message}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-default-200 bg-default-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-default-500">Detected files</div>
                    <div className="mt-2 text-2xl font-semibold">{detectedFiles.length}</div>
                  </div>
                  <div className="rounded-xl border border-default-200 bg-default-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-default-500">Assets</div>
                    <div className="mt-2 text-2xl font-semibold">{pluginAssets.length}</div>
                  </div>
                </div>

                <div className="rounded-xl border border-default-200 bg-content2/40 p-4">
                  <div className="mb-3 text-sm font-semibold">Plugin data</div>
                  {pluginData ? (
                    <div className="space-y-3 text-sm">
                      <div>
                        <div className="text-xs uppercase tracking-wide text-default-500">Name</div>
                        <div className="font-medium">{pluginData.name}</div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-wide text-default-500">Author</div>
                        <div className="font-medium">{pluginData.author}</div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-wide text-default-500">Version</div>
                        <div className="font-medium">{pluginData.version}</div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-wide text-default-500">Description</div>
                        <div className="text-default-600">{pluginData.description || 'No description in manifest.'}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-default-400">Manifest data will appear here after detection.</div>
                  )}
                </div>

                <div className="space-y-2">
                  {requiredChecklist.map((item) => (
                    <div key={item.key} className="flex items-center justify-between rounded-xl border border-default-200 bg-default-50 px-3 py-3">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <span className={`${item.ready ? 'text-success' : 'text-default-400'}`}>{item.icon}</span>
                        {item.label}
                      </div>
                      <Chip size="sm" color={item.ready ? 'success' : 'default'} variant="flat">
                        {item.ready ? 'ready' : 'waiting'}
                      </Chip>
                    </div>
                  ))}
                </div>




                {editingPlugin && (
                  <div className="rounded-xl border border-warning/20 bg-warning/10 p-4 text-sm text-warning-700 dark:text-warning">
                    Updating existing plugin: <strong>{editingPlugin.name}</strong>
                  </div>
                )}
              </CardBody>
            </Card>
          </div>

          <input ref={folderInputRef} type="file" multiple className="hidden" {...({ webkitdirectory: '', directory: '' } as any)} onChange={(event) => event.target.files && processSelectedFiles(event.target.files)} />
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(event) => event.target.files && processSelectedFiles(event.target.files)} />
        </Tab>

        <Tab key="manage" title={<div className="flex items-center gap-2 px-2"><CodeIcon size={18} /><span>Marketplace</span></div>}>
          <div className="h-full min-h-0 overflow-hidden">
            <Card className="flex h-full min-h-0 flex-col border border-default-200 bg-content1 shadow-sm">
              <CardHeader className="pb-3">
                <div>
                  <div className="text-lg font-semibold">Published Plugins</div>
                  <div className="text-sm text-default-500">Quick view, edit, and delete published plugins.</div>
                </div>
              </CardHeader>
              <Divider />
              <CardBody className="min-h-0 overflow-auto p-0">
                {allPlugins && allPlugins.length > 0 ? (
                  <div className="grid grid-cols-1 divide-y divide-default-200">
                    {allPlugins.map((plugin) => (
                      <div key={plugin._id} className="group flex items-center gap-4 p-4 transition-colors hover:bg-default-50">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-default-200 bg-default-50 p-2 shadow-sm">
                          <PluginIcon pluginName={plugin.name} imageClassName="h-full w-full object-contain" fallback={<Image size={20} className="text-default-400" />} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="truncate text-sm font-semibold">{plugin.name}</h3>
                            <Chip size="sm" variant="flat" className="h-5 text-[10px] font-bold">v{plugin.version}</Chip>
                            {plugin.isActive && <Chip size="sm" color="success" variant="flat" className="h-5 text-[10px] font-bold">LIVE</Chip>}
                          </div>
                          <p className="mt-1 truncate text-xs text-default-500">{plugin.description || 'No description'} | <span className="font-medium text-primary">@{plugin.author}</span></p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Tooltip content="Quick View">
                            <Button size="sm" variant="light" isIconOnly className="h-8 w-8 text-default-600" onPress={() => { setPluginToPreview(plugin); onPreviewModalOpen(); }}>
                              <Eye size={16} />
                            </Button>
                          </Tooltip>
                          <Tooltip content="Edit in uploader">
                            <Button size="sm" variant="light" isIconOnly className="h-8 w-8 text-default-600" onPress={() => handleEditPlugin(plugin)}>
                              <Edit size={16} />
                            </Button>
                          </Tooltip>
                          <Tooltip content="Delete plugin" color="danger">
                            <Button size="sm" variant="light" color="danger" isIconOnly className="h-8 w-8" onPress={() => { setPluginToDelete(plugin); onDeleteModalOpen(); }}>
                              <Trash2 size={16} />
                            </Button>
                          </Tooltip>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-20 text-center">
                    <div className="mb-6 inline-flex h-20 w-20 items-center justify-center rounded-full bg-default-100 text-default-300">
                      <CodeIcon size={40} />
                    </div>
                    <h3 className="font-semibold text-default-500">Empty Marketplace</h3>
                    <p className="mt-1 text-xs text-default-400">Start by publishing your first plugin to the global directory.</p>
                  </div>
                )}
              </CardBody>
            </Card>
          </div>
        </Tab>
      </Tabs>

      <Modal isOpen={isDeleteModalOpen} onClose={onDeleteModalClose} size="sm" backdrop="blur" classNames={appModalClassNames}>
        <ModalContent>
          <ModalHeader className="flex items-center gap-2 text-danger">
            <Trash2 size={20} />
            <span className="font-bold">Delete Plugin</span>
          </ModalHeader>
          <ModalBody className="py-6">
            <p className="text-sm font-medium">You are about to delete <strong>{pluginToDelete?.name}</strong>.</p>
            <p className="mt-2 flex gap-2 rounded-lg bg-danger/5 p-3 text-xs text-danger/80">
              <AlertCircle size={14} className="shrink-0" />
              This action is irreversible and removes the plugin for all active users.
            </p>
          </ModalBody>
          <ModalFooter>
            <Button size="sm" variant="flat" onPress={onDeleteModalClose}>Cancel</Button>
            <Button size="sm" color="danger" onPress={confirmDelete}>Confirm Delete</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={isPreviewModalOpen} onClose={onPreviewModalClose} size="lg" backdrop="blur" classNames={appModalClassNames}>
        <ModalContent>
          <ModalHeader className="font-bold">Plugin Details</ModalHeader>
          <Divider className="opacity-50" />
          <ModalBody className="space-y-6 py-6">
            {pluginToPreview && (
              <>
                <div className="flex items-center gap-6">
                  <div className="flex h-20 w-20 items-center justify-center rounded-3xl border border-default-200 bg-default-50 p-4 shadow-sm">
                    <PluginIcon pluginName={pluginToPreview.name} imageClassName="h-full w-full object-contain" fallback={<Image size={32} className="text-default-400" />} />
                  </div>
                  <div className="flex-1 space-y-1">
                    <h3 className="text-2xl font-black">{pluginToPreview.name}</h3>
                    <div className="flex gap-2">
                      <Chip size="sm" variant="flat" className="font-bold">v{pluginToPreview.version}</Chip>
                      <Chip size="sm" color={pluginToPreview.isActive ? 'success' : 'default'} variant="flat" className="font-bold">{pluginToPreview.isActive ? 'LIVE' : 'INACTIVE'}</Chip>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-default-400">Publisher</div>
                    <div className="text-sm font-semibold">@{pluginToPreview.author}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-default-400">Last Update</div>
                    <div className="text-sm font-semibold">{new Date(pluginToPreview.uploadDate).toLocaleDateString(undefined, { dateStyle: 'long' })}</div>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-default-400">Description</div>
                  <div className="rounded-xl border border-default-200 bg-default-50 p-4 text-sm italic leading-relaxed text-default-600">
                    {pluginToPreview.description || 'No description provided.'}
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-default-400">Infrastructure ID</div>
                  <Code size="sm" className="w-full border border-default-200 bg-default-100 py-1 text-[10px] font-mono text-default-500">{pluginToPreview._id}</Code>
                </div>
              </>
            )}
          </ModalBody>
          <Divider className="opacity-50" />
          <ModalFooter>
            <Button variant="solid" color="primary" className="font-bold px-8" onPress={onPreviewModalClose}>Close View</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
};
