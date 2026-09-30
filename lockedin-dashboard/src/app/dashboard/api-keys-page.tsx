import React, { useEffect, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';
import {
  Button,
  Card,
  CardBody,
  Chip,
  Checkbox,
  Divider,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  Textarea,
  useDisclosure,
} from '@heroui/react';
import { AppAlertDialog, AppConfirmDialog, appModalClassNames } from '@/components/app-dialogs';
import {
  FaCheck,
  FaCopy,
  FaEdit,
  FaEye,
  FaExclamationTriangle,
  FaKey,
  FaLock,
  FaPlus,
  FaShieldAlt,
  FaTimes,
  FaTrash,
} from 'react-icons/fa';

interface PageProps {
  username?: string;
  userData?: Record<string, unknown>;
}

interface ApiKey {
  _id: Id<'apiKeys'>;
  name: string;
  description?: string;
  scopes: string[];
  allowedPlugins?: string[];
  dataScopes?: string[];
  allowedEndpoints?: string[];
  blockedEndpoints?: string[];
  rateLimit?: number;
  isActive: boolean;
  lastUsed?: number;
  createdAt: number;
  kind?: 'MANUAL' | 'SERVER_MODULE';
  serverId?: string;
  serverModuleId?: string;
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export const ApiKeysPage: React.FC<PageProps> = () => {
  const [selectedKey, setSelectedKey] = useState<ApiKey | null>(null);
  const [viewKey, setViewKey] = useState<ApiKey | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');
  const [confirmConfig, setConfirmConfig] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [pluginTabSelection, setSelectedPluginTab] = useState<string>('');
  const [step, setStep] = useState(1);

  const { isOpen, onOpen, onClose } = useDisclosure();
  const { isOpen: isViewOpen, onOpen: onViewOpen, onClose: onViewClose } = useDisclosure();
  const { isOpen: isAlertOpen, onOpen: onAlertOpen, onClose: onAlertClose } = useDisclosure();
  const { isOpen: isConfirmOpen, onOpen: onConfirmOpen, onClose: onConfirmClose } = useDisclosure();

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    allowedEndpoints: [] as string[],
    blockedEndpoints: [] as string[],
    rateLimit: 0,
  });

  const keysData = useQuery(api.apiKeys.listKeys);
  const pluginsData = useQuery(api.context.getAllPlugins);
  const generateKey = useMutation(api.apiKeys.generateKey);
  const updateKey = useMutation(api.apiKeys.updateKey);
  const revokeKey = useMutation(api.apiKeys.revokeKey);
  const deleteKey = useMutation(api.apiKeys.deleteKey);

  const keys = keysData ?? [];
  const selectedPluginTab = pluginTabSelection || pluginsData?.[0]?.name || '';

  const showAlert = (message: string) => {
    setAlertMessage(message);
    onAlertOpen();
  };

  const showConfirm = (message: string, onConfirm: () => void) => {
    setConfirmConfig({ message, onConfirm });
    onConfirmOpen();
  };

  const resetForm = () => {
    setFormData({ name: '', description: '', allowedEndpoints: [], blockedEndpoints: [], rateLimit: 0 });
    setSelectedKey(null);
    setIsEditMode(false);
    setSelectedPluginTab('');
    setStep(1);
  };

  const handleCreateKey = async () => {
    if (!formData.name.trim()) {
      showAlert('Please enter a key name');
      return;
    }
    if (formData.allowedEndpoints.length === 0) {
      showAlert('Please enable at least one endpoint');
      return;
    }

    try {
      const key = await generateKey({
        name: formData.name,
        description: formData.description,
        scopes: ['plugin:read', 'plugin:write', 'data:read', 'data:write', 'api:call', 'files:read', 'files:upload'],
        allowedPlugins: [...new Set(formData.allowedEndpoints.map((entry) => entry.split('/')[0]))],
        allowedEndpoints: formData.allowedEndpoints,
        blockedEndpoints: formData.blockedEndpoints.length > 0 ? formData.blockedEndpoints : undefined,
        rateLimit: formData.rateLimit || undefined,
      });
      setNewKey(key);
      resetForm();
      onClose();
    } catch {
      showAlert('Failed to create key');
    }
  };

  const handleUpdateKey = async () => {
    if (!selectedKey) return;

    try {
      await updateKey({
        id: selectedKey._id,
        name: formData.name,
        description: formData.description,
        scopes: ['plugin:read', 'plugin:write', 'data:read', 'data:write', 'api:call', 'files:read', 'files:upload'],
        allowedPlugins: formData.allowedEndpoints.length > 0 ? [...new Set(formData.allowedEndpoints.map((entry) => entry.split('/')[0]))] : undefined,
        allowedEndpoints: formData.allowedEndpoints.length > 0 ? formData.allowedEndpoints : undefined,
        blockedEndpoints: formData.blockedEndpoints.length > 0 ? formData.blockedEndpoints : undefined,
        rateLimit: formData.rateLimit || undefined,
      });
      showAlert('Key updated successfully');
      resetForm();
      onClose();
    } catch {
      showAlert('Failed to update key');
    }
  };

  const handleEditKey = (key: ApiKey) => {
    setSelectedKey(key);
    setFormData({
      name: key.name,
      description: key.description || '',
      allowedEndpoints: key.allowedEndpoints || [],
      blockedEndpoints: key.blockedEndpoints || [],
      rateLimit: key.rateLimit || 0,
    });
    setIsEditMode(true);
    onOpen();
  };

  const handleRevoke = (id: Id<'apiKeys'>) => {
    showConfirm('This key will stop working immediately and cannot be restored.', async () => {
      try {
        await revokeKey({ id });
        showAlert('Key revoked.');
      } catch {
      }
    });
  };

  const handleDeleteRevoked = (id: Id<'apiKeys'>) => {
    showConfirm('Permanently delete this revoked key?', async () => {
      try {
        await deleteKey({ id });
        showAlert('Revoked key deleted.');
      } catch (error) {
        showAlert(error instanceof Error ? error.message : 'Failed to delete key');
      }
    });
  };

  const handleDeleteAllRevoked = () => {
    const revoked = keys.filter((key) => !key.isActive);
    if (revoked.length === 0) return;

    showConfirm(`Delete ${revoked.length} revoked key(s) permanently?`, async () => {
      try {
        await Promise.all(revoked.map((key) => deleteKey({ id: key._id })));
        showAlert('All revoked keys deleted.');
      } catch (error) {
        showAlert(error instanceof Error ? error.message : 'Failed to delete revoked keys');
      }
    });
  };

  const copyToClipboard = () => {
    if (!newKey) return;
    navigator.clipboard.writeText(newKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const activeKeys = keys.filter((key) => key.isActive).length;
  const revokedKeys = keys.filter((key) => !key.isActive).length;

  return (
    <div className="w-full flex flex-col gap-6 p-4 md:p-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <div className="bg-primary/10 p-2 rounded-xl">
              <FaKey className="text-primary text-xl" />
            </div>
            API Keys
          </h1>
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-default-500 text-sm">Manage API access for integrations and IoT devices</p>
            <div className="flex items-center gap-2">
              <Chip size="sm" variant="flat" color="default">{keys.length} total</Chip>
              <Chip size="sm" variant="flat" color="success">{activeKeys} active</Chip>
              {revokedKeys > 0 && <Chip size="sm" variant="flat" color="danger">{revokedKeys} revoked</Chip>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            color="primary"
            startContent={<FaPlus />}
            onPress={() => {
              resetForm();
              setIsEditMode(false);
              onOpen();
            }}
            className="shadow-lg shadow-primary/20 font-semibold"
          >
            New API Key
          </Button>
          {revokedKeys > 0 && (
            <Button color="danger" variant="flat" startContent={<FaTrash />} onPress={handleDeleteAllRevoked} className="font-semibold">
              Delete Revoked
            </Button>
          )}
        </div>
      </div>

      {newKey && (
        <Card className="border border-success/30 bg-success/5">
          <CardBody className="gap-4">
            <div className="flex items-center gap-2 text-success font-semibold">
              <FaCheck /> Key created - save it now, you will not see it again
            </div>
            <div className="flex gap-2 items-center bg-default-100 border border-default-200 rounded-xl p-3 font-mono text-sm break-all">
              <span className="flex-1 select-all">{newKey}</span>
              <Button isIconOnly size="sm" variant="light" onClick={copyToClipboard}>
                {copied ? <FaCheck className="text-success" /> : <FaCopy />}
              </Button>
            </div>
            <Button color="success" variant="flat" onClick={() => setNewKey(null)} fullWidth>
              Done - I saved it
            </Button>
          </CardBody>
        </Card>
      )}

      <Card className="border border-default-200 shadow-sm">
        <CardBody className="p-0">
          {keys.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="bg-default-100 p-5 rounded-full">
                <FaKey className="text-4xl text-default-300" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-default-600">No API keys yet</p>
                <p className="text-sm text-default-400 mt-1">Create a key to integrate with external apps and IoT devices</p>
              </div>
              <Button color="primary" startContent={<FaPlus />} onPress={() => { resetForm(); setIsEditMode(false); onOpen(); }}>
                Create your first key
              </Button>
            </div>
          ) : (
            <Table
              aria-label="API Keys"
              removeWrapper
              classNames={{
                th: 'bg-default-50 text-default-500 font-semibold text-xs uppercase tracking-wide border-b border-default-200',
                td: 'py-4',
                tr: 'border-b border-default-100 last:border-0',
              }}
            >
              <TableHeader>
                <TableColumn>KEY</TableColumn>
                <TableColumn>STATUS</TableColumn>
                <TableColumn>ENDPOINTS</TableColumn>
                <TableColumn>LAST USED</TableColumn>
                <TableColumn align="end">ACTIONS</TableColumn>
              </TableHeader>
              <TableBody>
                {keys.map((key) => (
                  <TableRow key={key._id} className="hover:bg-default-50 transition-colors">
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <span className="flex items-center gap-2 font-semibold text-foreground">{key.name}{key.kind === 'SERVER_MODULE' ? <Chip size="sm" variant="flat" color="secondary">SERVER</Chip> : null}</span>
                        {key.description && <span className="text-xs text-default-400 max-w-[220px] truncate">{key.description}</span>}
                        <span className="text-tiny text-default-300">
                          Created {timeAgo(key.createdAt)}
                          {key.rateLimit ? ` | ${key.rateLimit} req/min` : ''}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Chip color={key.isActive ? 'success' : 'default'} variant="flat" size="sm" startContent={key.isActive ? <FaCheck size={9} /> : <FaTimes size={9} />}>
                        {key.isActive ? 'Active' : 'Revoked'}
                      </Chip>
                    </TableCell>
                    <TableCell>
                      {key.allowedEndpoints && key.allowedEndpoints.length > 0 ? (
                        <span className="text-sm text-default-600">
                          <span className="font-semibold text-success">{key.allowedEndpoints.length}</span> allowed
                          {key.blockedEndpoints && key.blockedEndpoints.length > 0 && <><span> | </span><span className="text-danger">{key.blockedEndpoints.length}</span> blocked</>}
                        </span>
                      ) : (
                        <span className="text-sm text-default-400">All access</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-default-500">{key.lastUsed ? timeAgo(key.lastUsed) : 'Never'}</span>
                    </TableCell>
                    <TableCell>
                      {key.isActive ? (
                        <div className="flex gap-1 justify-end">
                          <Button isIconOnly size="sm" variant="light" color="primary" title="View details" onClick={() => { setViewKey(key); onViewOpen(); }}>
                            <FaEye size={13} />
                          </Button>
                          <Button isIconOnly size="sm" variant="light" color="default" title="Edit" onClick={() => handleEditKey(key)}>
                            <FaEdit size={13} />
                          </Button>
                          <Button isIconOnly size="sm" variant="light" color="danger" title="Revoke" onClick={() => handleRevoke(key._id)}>
                            <FaTrash size={13} />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex gap-1 justify-end">
                          <Button isIconOnly size="sm" variant="light" color="danger" title="Delete permanently" onClick={() => handleDeleteRevoked(key._id)}>
                            <FaTrash size={13} />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Modal isOpen={isOpen} onClose={() => { onClose(); resetForm(); }} size="3xl" scrollBehavior="inside" backdrop="blur" classNames={appModalClassNames}>
        <ModalContent>
          <ModalHeader className="flex flex-col gap-3 pt-5">
            <div className="flex items-center gap-2">
              {[1, 2, 3].map((current) => (
                <React.Fragment key={current}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${current === step ? 'bg-primary text-white shadow-md shadow-primary/30' : current < step ? 'bg-success text-white' : 'bg-default-100 text-default-400'}`}>
                    {current < step ? <FaCheck size={10} /> : current}
                  </div>
                  {current < 3 && <div className={`flex-1 h-0.5 rounded transition-all ${current < step ? 'bg-success' : 'bg-default-200'}`} />}
                </React.Fragment>
              ))}
            </div>
            <div>
              <div className="flex items-center gap-2 text-lg font-bold">
                <FaLock className="text-primary text-sm" />
                {isEditMode ? 'Edit API Key' : 'New API Key'} - Step {step} of 3
              </div>
              <p className="text-tiny font-normal text-default-400 mt-0.5">
                {step === 1 ? 'Name and describe your key' : step === 2 ? 'Choose which endpoints this key can call' : 'Review and confirm'}
              </p>
            </div>
          </ModalHeader>

          {step === 1 && (
            <ModalBody className="py-6 flex flex-col gap-5">
              <Input label="Key Name" placeholder="e.g. Gate Controller, Parking API" variant="bordered" value={formData.name} onValueChange={(value) => setFormData({ ...formData, name: value })} isRequired description="Give this key a descriptive name" startContent={<FaKey className="text-default-400 text-sm" />} />
              <Textarea label="Description" placeholder="What is this key for? Where is it deployed?" variant="bordered" value={formData.description} onValueChange={(value) => setFormData({ ...formData, description: value })} minRows={2} description="Optional - add notes about this key's purpose" />
              <Input label="Rate Limit (requests/minute)" type="number" variant="bordered" placeholder="0 for unlimited" value={String(formData.rateLimit)} onValueChange={(value) => setFormData({ ...formData, rateLimit: parseInt(value, 10) || 0 })} description="Throttle how many requests this key can make per minute" />
            </ModalBody>
          )}

          {step === 2 && (
            <ModalBody className="py-6">
              <p className="text-sm text-default-500 mb-3">Select which plugin endpoints this key can access</p>
              {pluginsData && pluginsData.length > 0 ? (
                <div className="flex gap-0 border border-default-200 rounded-xl overflow-hidden" style={{ height: '360px' }}>
                  <div className="w-52 border-r border-default-200 overflow-y-auto bg-default-50">
                    {pluginsData.map((plugin: any) => {
                      const endpoints = plugin?.apiEndpoints || [];
                      const enabled = endpoints.filter((endpoint: string) => formData.allowedEndpoints.includes(`${plugin.name}/${endpoint}`)).length;
                      const allSelected = enabled === endpoints.length && endpoints.length > 0;
                      const partiallySelected = enabled > 0 && enabled < endpoints.length;

                      return (
                        <div key={plugin._id} className={`border-b border-default-200 ${selectedPluginTab === plugin.name ? 'bg-default-100' : 'hover:bg-default-100'}`}>
                          <button type="button" onClick={() => setSelectedPluginTab(plugin.name)} className="w-full px-4 py-3 text-left text-sm flex items-center justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-foreground truncate">{plugin.name}</p>
                              <p className="text-xs text-default-400">{endpoints.length} endpoints | {enabled} enabled</p>
                            </div>
                            <Checkbox
                              isSelected={allSelected}
                              isIndeterminate={partiallySelected}
                              size="sm"
                              onClick={(event) => event.stopPropagation()}
                              onValueChange={(checked) => {
                                if (checked || partiallySelected) {
                                  const nextAllowed = [...formData.allowedEndpoints];
                                  endpoints.forEach((endpoint: string) => {
                                    const key = `${plugin.name}/${endpoint}`;
                                    if (!nextAllowed.includes(key)) nextAllowed.push(key);
                                  });
                                  setFormData({ ...formData, allowedEndpoints: nextAllowed });
                                } else {
                                  setFormData({ ...formData, allowedEndpoints: formData.allowedEndpoints.filter((entry) => !entry.startsWith(`${plugin.name}/`)) });
                                }
                              }}
                            />
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex-1 p-4 overflow-y-auto">
                    {selectedPluginTab ? (() => {
                      const selectedPlugin = pluginsData.find((plugin: any) => plugin.name === selectedPluginTab);
                      const endpoints = selectedPlugin?.apiEndpoints || [];
                      if (endpoints.length === 0) {
                        return <p className="text-sm text-default-400 text-center py-12">No endpoints for this plugin</p>;
                      }

                      return (
                        <div className="flex flex-col gap-3">
                          <div>
                            <p className="font-semibold text-foreground">{selectedPluginTab}</p>
                            <p className="text-xs text-default-400">{endpoints.filter((endpoint: string) => formData.allowedEndpoints.includes(`${selectedPluginTab}/${endpoint}`)).length}/{endpoints.length} enabled</p>
                          </div>
                          {endpoints.map((endpoint: string, index: number) => {
                            const endpointKey = `${selectedPluginTab}/${endpoint}`;
                            const isEnabled = formData.allowedEndpoints.includes(endpointKey);
                            return (
                              <div key={index} className={`flex items-center justify-between p-3 rounded-lg border transition-all ${isEnabled ? 'bg-success/5 border-success/30' : 'bg-default-50 border-default-200 hover:border-default-300'}`}>
                                <div>
                                  <p className="text-sm font-medium text-foreground">{endpoint}</p>
                                  <p className="text-xs text-default-400 font-mono">/api/{selectedPluginTab}/{endpoint}</p>
                                </div>
                                <Checkbox
                                  isSelected={isEnabled}
                                  size="lg"
                                  color="success"
                                  onValueChange={(checked) => {
                                    setFormData({
                                      ...formData,
                                      allowedEndpoints: checked ? [...formData.allowedEndpoints, endpointKey] : formData.allowedEndpoints.filter((entry) => entry !== endpointKey),
                                    });
                                  }}
                                />
                              </div>
                            );
                          })}
                        </div>
                      );
                    })() : <p className="text-sm text-default-400 text-center py-12">Select a plugin to manage its endpoints</p>}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-default-400 text-center py-8">No plugins available in the system</p>
              )}
            </ModalBody>
          )}

          {step === 3 && (
            <ModalBody className="py-6 flex flex-col gap-4">
              <p className="text-sm font-semibold text-default-600">Review your configuration</p>
              <div className="bg-default-50 border border-default-200 rounded-xl p-4 flex flex-col gap-3">
                <div className="flex justify-between text-sm">
                  <span className="text-default-500">Name</span>
                  <span className="font-semibold font-mono">{formData.name || '-'}</span>
                </div>
                {formData.description && (
                  <div className="flex justify-between text-sm gap-4">
                    <span className="text-default-500">Description</span>
                    <span className="text-right max-w-[60%]">{formData.description}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-default-500">Rate Limit</span>
                  <span>{formData.rateLimit > 0 ? `${formData.rateLimit} req/min` : 'Unlimited'}</span>
                </div>
                <Divider />
                <div className="flex justify-between text-sm">
                  <span className="text-default-500">Plugins</span>
                  <Chip size="sm" color="primary" variant="flat">{new Set(formData.allowedEndpoints.map((entry) => entry.split('/')[0])).size}</Chip>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-default-500">Endpoints</span>
                  <Chip size="sm" color="success" variant="flat">{formData.allowedEndpoints.length} allowed</Chip>
                </div>
              </div>
            </ModalBody>
          )}

          <ModalFooter className="gap-2">
            <Button variant="light" color="danger" onPress={() => { onClose(); resetForm(); }}>Cancel</Button>
            {step > 1 && <Button variant="bordered" className="border-default-300 bg-default-50 text-foreground hover:bg-default-100 dark:border-white/30 dark:bg-white/5 dark:text-white dark:hover:bg-white/10" onPress={() => setStep(step - 1)}>{'<'} Back</Button>}
            {step < 3 ? (
              <Button color="primary" onPress={() => {
                if (step === 1 && !formData.name.trim()) {
                  showAlert('Please enter a key name');
                  return;
                }
                if (step === 2 && formData.allowedEndpoints.length === 0) {
                  showAlert('Please enable at least one endpoint');
                  return;
                }
                setStep(step + 1);
              }}>
                Continue {'>'}
              </Button>
            ) : (
              <Button color="success" onClick={isEditMode ? handleUpdateKey : handleCreateKey}>
                {isEditMode ? 'Save Changes' : 'Create Key'}
              </Button>
            )}
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={isViewOpen} onClose={onViewClose} size="2xl" backdrop="blur" classNames={appModalClassNames}>
        <ModalContent>
          <ModalHeader className="flex items-center gap-2">
            <FaShieldAlt className="text-primary" /> Key Details
          </ModalHeader>
          <ModalBody className="py-6 flex flex-col gap-4">
            {viewKey && (
              <>
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-lg">{viewKey.name}</h3>
                    {viewKey.description && <p className="text-sm text-default-500 mt-0.5">{viewKey.description}</p>}
                  </div>
                  <Chip color={viewKey.isActive ? 'success' : 'danger'} variant="flat" size="sm">
                    {viewKey.isActive ? 'Active' : 'Revoked'}
                  </Chip>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {[
                    { label: 'Created', value: new Date(viewKey.createdAt).toLocaleString() },
                    { label: 'Last Used', value: viewKey.lastUsed ? new Date(viewKey.lastUsed).toLocaleString() : 'Never' },
                    { label: 'Rate Limit', value: viewKey.rateLimit ? `${viewKey.rateLimit} req/min` : 'Unlimited' },
                    { label: 'Endpoints', value: viewKey.allowedEndpoints?.length ?? 'All' },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-default-50 border border-default-200 rounded-lg p-3">
                      <p className="text-default-400 text-xs mb-1">{label}</p>
                      <p className="font-semibold">{value}</p>
                    </div>
                  ))}
                </div>
                <div className="bg-warning/5 border border-warning/30 rounded-xl p-4 flex items-start gap-3">
                  <FaExclamationTriangle className="text-warning mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-default-600 dark:text-white/80">
                    For security, the full API key is only shown once at creation time. If you lose it, revoke this key and create a new one.
                  </p>
                </div>
                {viewKey.allowedEndpoints && viewKey.allowedEndpoints.length > 0 && (
                  <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
                    <p className="text-xs font-semibold text-default-500 uppercase tracking-wide">Allowed Endpoints</p>
                    {Array.from(new Set(viewKey.allowedEndpoints.map((entry) => entry.split('/')[0]))).map((plugin) => (
                      <div key={plugin} className="bg-success/5 border border-success/20 rounded-lg p-3">
                        <p className="text-xs font-bold text-success mb-2">{plugin}</p>
                        <div className="flex flex-wrap gap-1">
                          {viewKey.allowedEndpoints!.filter((entry) => entry.startsWith(`${plugin}/`)).map((entry) => (
                            <Chip key={entry} size="sm" variant="flat" color="success" className="font-mono text-xs">
                              {entry.split('/')[1]}
                            </Chip>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={onViewClose}>Close</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <AppAlertDialog isOpen={isAlertOpen} onClose={onAlertClose} message={alertMessage} />
      <AppConfirmDialog
        isOpen={isConfirmOpen}
        onClose={onConfirmClose}
        message={confirmConfig?.message || ''}
        onConfirm={() => {
          confirmConfig?.onConfirm();
          onConfirmClose();
        }}
      />
    </div>
  );
};
