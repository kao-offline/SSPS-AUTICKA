import React, { useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  useDisclosure,
} from "@heroui/react";
import { AppAlertDialog, AppConfirmDialog, appModalClassNames } from "@/components/app-dialogs";
import { FaBan, FaTrash, FaUpload } from "react-icons/fa";

interface PageProps {
  username?: string;
  userData?: Record<string, unknown>;
}

type MarketplaceRow = {
  _id: Id<"serverMarketplaceModules">;
  moduleId: string;
  name: string;
  version: string | null;
  entrypoint: string | null;
  uploadedAt: number;
  allowedEndpoints: string[];
  isActive: boolean;
  deactivatedAt: number | null;
};

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };
    reader.readAsDataURL(file);
  });
};

export const ServersMarketplacePage: React.FC<PageProps> = () => {
  const marketplace = useQuery(api.servers.listMarketplaceModules) as MarketplaceRow[] | undefined;
  const uploadMarketplaceModuleZipAction = useAction(api.serversNode.uploadMarketplaceModuleZipAction);
  const setMarketplaceModuleActive = useMutation(api.servers.setMarketplaceModuleActive);
  const deleteMarketplaceModulePermanently = useMutation(api.servers.deleteMarketplaceModulePermanently);

  const { isOpen, onOpen, onClose } = useDisclosure();

  const [zipFile, setZipFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [alertMessage, setAlertMessage] = useState("");
  const [confirm, setConfirm] = useState<{ message: string; onConfirm: () => void } | null>(null);

  const rows = useMemo(() => marketplace ?? [], [marketplace]);

  const handleUpload = async () => {
    if (!zipFile) {
      setAlertMessage("Select a .zip first");
      return;
    }

    setIsUploading(true);
    try {
      const base64 = await fileToBase64(zipFile);
      await uploadMarketplaceModuleZipAction({ zipBase64: base64 });
      setZipFile(null);
      onClose();
    } catch (err: any) {
      setAlertMessage(err?.message || "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const askDeactivate = (m: MarketplaceRow) => {
    setConfirm({
      message: `Deactivate ${m.moduleId}? This will uninstall it from all servers and stop it from running.`,
      onConfirm: async () => {
        try {
          await setMarketplaceModuleActive({ marketplaceId: m._id, isActive: false });
        } catch (err: any) {
          setAlertMessage(err?.message || "Failed to deactivate");
        } finally {
          setConfirm(null);
        }
      },
    });
  };

  const askActivate = (m: MarketplaceRow) => {
    setConfirm({
      message: `Activate ${m.moduleId}? This allows installing it again (it will not auto-install).`,
      onConfirm: async () => {
        try {
          await setMarketplaceModuleActive({ marketplaceId: m._id, isActive: true });
        } catch (err: any) {
          setAlertMessage(err?.message || "Failed to activate");
        } finally {
          setConfirm(null);
        }
      },
    });
  };

  const askDelete = (m: MarketplaceRow) => {
    setConfirm({
      message: `Permanently delete ${m.moduleId} from Marketplace? This uninstalls it from all servers and deletes the stored zip.`,
      onConfirm: async () => {
        try {
          await deleteMarketplaceModulePermanently({ marketplaceId: m._id });
        } catch (err: any) {
          setAlertMessage(err?.message || "Failed to delete");
        } finally {
          setConfirm(null);
        }
      },
    });
  };

  return (
    <div className="w-full flex flex-col gap-6 p-4 md:p-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold tracking-tight">Server Marketplace</h1>
          <p className="text-default-500 text-sm">
            Upload server module zips here. Uploading does not install them on any server.
          </p>
        </div>
        <Button color="secondary" startContent={<FaUpload />} onPress={onOpen}>
          Upload .zip
        </Button>
      </div>

      <Card className="border border-default-200">
        <CardHeader className="flex items-center justify-between">
          <div className="flex flex-col">
            <div className="text-lg font-semibold">Uploaded modules</div>
            <div className="text-xs text-default-500">Available to install on bound servers</div>
          </div>
          <Chip size="sm" variant="flat" color="default">
            {rows.length} total
          </Chip>
        </CardHeader>
        <CardBody>
          {!marketplace ? (
            <div className="flex items-center justify-center min-h-[240px]">
              <Spinner size="lg" label="Loading marketplace..." color="primary" labelColor="primary" />
            </div>
          ) : rows.length === 0 ? (
            <div className="text-sm text-default-500">No server modules uploaded yet.</div>
          ) : (
            <Table aria-label="Marketplace modules" className="min-w-full">
              <TableHeader>
                <TableColumn>MODULE</TableColumn>
                <TableColumn>PERMISSIONS</TableColumn>
                <TableColumn>STATUS</TableColumn>
                <TableColumn>ACTIONS</TableColumn>
              </TableHeader>
              <TableBody>
                {rows.map((m) => (
                  <TableRow key={m._id}>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <div className="font-semibold">{m.name}</div>
                        <div className="text-xs text-default-500 font-mono">
                          {m.moduleId}{m.version ? `@${m.version}` : ""}
                        </div>
                        {m.entrypoint && (
                          <div className="text-[11px] text-default-500 font-mono">entry: {m.entrypoint}</div>
                        )}
                        <div className="text-[11px] text-default-500">uploaded {timeAgo(m.uploadedAt)}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-[520px] space-y-1">
                        {m.allowedEndpoints.slice(0, 4).map((ep) => (
                          <div key={ep} className="font-mono text-[11px] text-default-500">{ep}</div>
                        ))}
                        {m.allowedEndpoints.length > 4 && (
                          <div className="text-[11px] text-default-400">+{m.allowedEndpoints.length - 4} more</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <Chip size="sm" variant="flat" color={m.isActive ? "success" : "default"}>
                          {m.isActive ? "active" : "deactivated"}
                        </Chip>
                        {!m.isActive && m.deactivatedAt && (
                          <div className="text-[11px] text-default-500">since {timeAgo(m.deactivatedAt)}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {m.isActive ? (
                          <Button
                            size="sm"
                            variant="flat"
                            color="warning"
                            startContent={<FaBan />}
                            onPress={() => askDeactivate(m)}
                          >
                            Deactivate
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="flat"
                            color="secondary"
                            onPress={() => askActivate(m)}
                          >
                            Activate
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="flat"
                          color="danger"
                          startContent={<FaTrash />}
                          onPress={() => askDelete(m)}
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Modal isOpen={isOpen} onClose={onClose} classNames={appModalClassNames}>
        <ModalContent>
          <ModalHeader>Upload server module (.zip)</ModalHeader>
          <ModalBody className="space-y-3">
            <div className="text-sm text-default-500">
              Upload a zip that contains <span className="font-mono">server-manifest.json</span>.
            </div>
            <input
              type="file"
              accept=".zip,application/zip"
              onChange={(e) => setZipFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-default-500 file:mr-4 file:rounded file:border-0 file:bg-white/10 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-white/15"
            />
            {zipFile && (
              <div className="text-xs text-default-500">
                Selected: <span className="font-mono">{zipFile.name}</span>
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={onClose}>
              Cancel
            </Button>
            <Button color="secondary" onPress={handleUpload} isLoading={isUploading}>
              Upload
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <AppAlertDialog isOpen={Boolean(alertMessage)} onClose={() => setAlertMessage("")} message={alertMessage} />
      <AppConfirmDialog
        isOpen={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        message={confirm?.message || ""}
        onConfirm={() => confirm?.onConfirm()}
      />
    </div>
  );
};