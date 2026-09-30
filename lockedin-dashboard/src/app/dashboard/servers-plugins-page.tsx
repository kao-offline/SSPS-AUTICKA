import { ManagementHeader } from '@/components/management-header';
﻿import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Divider,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  Textarea,
  useDisclosure,
} from "@heroui/react";
import { AppAlertDialog, AppConfirmDialog, appModalClassNames } from "@/components/app-dialogs";
import { FaCog, FaPlus, FaTrash } from "react-icons/fa";

interface PageProps {
  username?: string;
  userData?: Record<string, unknown>;
}

type ServerRow = {
  _id: Id<"servers">;
  name: string | null;
  serverInstanceId: string;
  lastSeen: number;
  status: string | null;
  modulesCount: number;
};

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

type ModuleRow = {
  _id: Id<"serverModules">;
  moduleId: string;
  name: string;
  version: string | null;
  entrypoint: string | null;
  allowedEndpoints: string[];
  status: string | null;
  updatedAt: number;
  desiredConfig: string | null;
  marketplaceId: Id<"serverMarketplaceModules"> | null;
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

export const ServersPluginsPage: React.FC<PageProps> = () => {
  const servers = useQuery(api.servers.listServers) as ServerRow[] | undefined;
  const marketplace = useQuery(api.servers.listMarketplaceModules) as MarketplaceRow[] | undefined;

  const installMarketplaceModule = useMutation(api.servers.installMarketplaceModule);
  const removeServerModule = useMutation(api.servers.removeServerModule);
  const updateServerModuleDesiredConfig = useMutation(api.servers.updateServerModuleDesiredConfig);

  const [selectedServerId, setSelectedServerId] = useState<Id<"servers"> | null>(null);

  const modules = useQuery(
    api.servers.listServerModules,
    selectedServerId ? { serverId: selectedServerId } : "skip"
  ) as ModuleRow[] | undefined;

  const [alertMessage, setAlertMessage] = useState("");
  const [confirmConfig, setConfirmConfig] = useState<{ message: string; onConfirm: () => void } | null>(null);

  const { isOpen: isAddOpen, onOpen: onAddOpen, onClose: onAddClose } = useDisclosure();
  const { isOpen: isSettingsOpen, onOpen: onSettingsOpen, onClose: onSettingsClose } = useDisclosure();

  const [isInstalling, setIsInstalling] = useState(false);

  const [settingsTarget, setSettingsTarget] = useState<ModuleRow | null>(null);
  const [settingsText, setSettingsText] = useState("{}");
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  useEffect(() => {
    if (!selectedServerId && servers && servers.length > 0) {
      setSelectedServerId(servers[0]._id);
    }
  }, [servers, selectedServerId]);

  const serverOptions = useMemo(() => servers ?? [], [servers]);
  const marketplaceOptions = useMemo(() => (marketplace ?? []).filter((m) => m.isActive), [marketplace]);
  const installedRows = useMemo(() => modules ?? [], [modules]);

  const handleInstall = async (marketplaceId: Id<"serverMarketplaceModules">) => {
    if (!selectedServerId) {
      setAlertMessage("Select a server first");
      return;
    }

    setIsInstalling(true);
    try {
      await installMarketplaceModule({ serverId: selectedServerId, marketplaceId });
      onAddClose();
    } catch (err: any) {
      setAlertMessage(err?.message || "Install failed");
    } finally {
      setIsInstalling(false);
    }
  };

  const handleRemove = (moduleId: string) => {
    if (!selectedServerId) return;
    setConfirmConfig({
      message: `Remove ${moduleId} from this server? This also revokes its API key.`,
      onConfirm: async () => {
        try {
          await removeServerModule({ serverId: selectedServerId, moduleId });
        } catch (err: any) {
          setAlertMessage(err?.message || "Remove failed");
        } finally {
          setConfirmConfig(null);
        }
      },
    });
  };

  const openSettings = (m: ModuleRow) => {
    setSettingsTarget(m);
    setSettingsText(m.desiredConfig || "{}");
    onSettingsOpen();
  };

  const saveSettings = async () => {
    if (!selectedServerId || !settingsTarget) return;
    setIsSavingSettings(true);
    try {
      await updateServerModuleDesiredConfig({
        serverId: selectedServerId,
        moduleId: settingsTarget.moduleId,
        desiredConfig: settingsText,
      });
      onSettingsClose();
    } catch (err: any) {
      setAlertMessage(err?.message || "Failed to save settings");
    } finally {
      setIsSavingSettings(false);
    }
  };

  return (
    <div className="management-page">
      <ManagementHeader title="Installed modules" />

      <Card className="management-panel">
        <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap w-full md:w-auto">
            <div className="text-sm font-semibold">Server</div>
            {!servers ? (
              <Spinner size="sm" color="primary" />
            ) : (
              <Select
                aria-label="Select server"
                selectedKeys={selectedServerId ? [String(selectedServerId)] : []}
                onSelectionChange={(keys) => {
                  const first = Array.from(keys)[0];
                  setSelectedServerId(first ? (first as any) : null);
                }}
                className="w-full sm:w-64"
                size="sm"
                variant="bordered"
              >
                {serverOptions.map((s) => (
                  <SelectItem key={String(s._id)}>
                    {s.name || s.serverInstanceId}
                  </SelectItem>
                ))}
              </Select>
            )}
            {selectedServerId && servers && (
              <Chip size="sm" variant="flat" color="default">
                {servers.find((x) => x._id === selectedServerId)?.modulesCount ?? 0} modules
              </Chip>
            )}
          </div>

          <Button
            color="primary"
            startContent={<FaPlus />}
            onPress={onAddOpen}
            isDisabled={!selectedServerId}
          >
            Install module
          </Button>
        </CardHeader>
        <Divider />
        <CardBody>
          {!selectedServerId ? (
            <div className="text-sm text-default-500">Choose a server.</div>
          ) : !modules ? (
            <div className="flex items-center justify-center min-h-[220px]">
              <Spinner size="lg" label="Loading installed modules..." color="primary" labelColor="primary" />
            </div>
          ) : installedRows.length === 0 ? (
            <div className="text-sm text-default-500">No modules installed.</div>
          ) : (
            <Table aria-label="Installed server modules" removeWrapper className="min-w-full">
              <TableHeader>
                <TableColumn>MODULE</TableColumn>
                <TableColumn>PERMISSIONS</TableColumn>
                <TableColumn>STATUS</TableColumn>
                <TableColumn>ACTIONS</TableColumn>
              </TableHeader>
              <TableBody>
                {installedRows.map((m) => (
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
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-[520px] space-y-1">
                        {m.allowedEndpoints.slice(0, 3).map((ep) => (
                          <div key={ep} className="font-mono text-[11px] text-default-500">{ep}</div>
                        ))}
                        {m.allowedEndpoints.length > 3 && (
                          <div className="text-[11px] text-default-500">+{m.allowedEndpoints.length - 3} more</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <Chip size="sm" variant="flat" color={m.status === "installed" ? "success" : "default"}>
                          {m.status || "unknown"}
                        </Chip>
                        <div className="text-[11px] text-default-500">updated {timeAgo(m.updatedAt)}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          isIconOnly
                          size="sm"
                          variant="flat"
                          color="default"
                          aria-label="Settings"
                          onPress={() => openSettings(m)}
                        >
                          <FaCog />
                        </Button>
                        <Button
                          isIconOnly
                          size="sm"
                          color="danger"
                          variant="flat"
                          aria-label="Remove module"
                          onPress={() => handleRemove(m.moduleId)}
                        >
                          <FaTrash />
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

      <Modal isOpen={isAddOpen} onClose={onAddClose} size="lg" classNames={appModalClassNames}>
        <ModalContent>
          <ModalHeader>Install module</ModalHeader>
          <ModalBody>
            {!marketplace ? (
              <div className="flex items-center justify-center min-h-[220px]">
                <Spinner size="lg" label="Loading marketplace..." color="primary" labelColor="primary" />
              </div>
            ) : marketplaceOptions.length === 0 ? (
              <div className="text-sm text-default-500">
                No modules available. Upload one to the module library.
              </div>
            ) : (
              <div className="space-y-3">
                {marketplaceOptions.map((m) => (
                  <Card key={m._id} className="management-panel">
                    <CardBody className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                      <div className="flex flex-col gap-1">
                        <div className="font-semibold">{m.name}</div>
                        <div className="text-xs text-default-500 font-mono">
                          {m.moduleId}{m.version ? `@${m.version}` : ""}
                        </div>
                        <div className="text-[11px] text-default-500">uploaded {timeAgo(m.uploadedAt)}</div>
                      </div>
                      <Button
                        color="secondary"
                        onPress={() => handleInstall(m._id)}
                        isLoading={isInstalling}
                      >
                        Add
                      </Button>
                    </CardBody>
                  </Card>
                ))}
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={onAddClose}>
              Close
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={isSettingsOpen} onClose={onSettingsClose} size="lg" classNames={appModalClassNames}>
        <ModalContent>
          <ModalHeader>Plugin settings</ModalHeader>
          <ModalBody className="space-y-3">
            <div className="text-sm text-default-500">
              Module: <span className="font-mono">{settingsTarget?.moduleId}</span>
            </div>
            <Textarea
              label="Config (JSON)"
              minRows={10}
              variant="bordered"
              value={settingsText}
              onValueChange={setSettingsText}
              className="font-mono"
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={onSettingsClose}>
              Cancel
            </Button>
            <Button color="secondary" onPress={saveSettings} isLoading={isSavingSettings}>
              Save
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <AppAlertDialog isOpen={Boolean(alertMessage)} onClose={() => setAlertMessage("")} message={alertMessage} />
      <AppConfirmDialog
        isOpen={Boolean(confirmConfig)}
        onClose={() => setConfirmConfig(null)}
        message={confirmConfig?.message || ""}
        onConfirm={() => confirmConfig?.onConfirm()}
      />
    </div>
  );
};