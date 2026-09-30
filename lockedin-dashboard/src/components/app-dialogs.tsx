'use client';

import React from 'react';
import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from '@heroui/react';
import { AlertTriangle, Info } from 'lucide-react';

export const appModalClassNames = {
  base: 'border border-divider bg-content1 text-foreground shadow-2xl shadow-black/20',
  header: 'border-b border-divider text-foreground',
  body: 'text-foreground',
  footer: 'border-t border-divider',
};

interface AppAlertDialogProps {
  isOpen: boolean;
  title?: string;
  message: string;
  onClose: () => void;
}

export function AppAlertDialog({
  isOpen,
  title = 'Notice',
  message,
  onClose,
}: AppAlertDialogProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm" backdrop="blur" classNames={appModalClassNames}>
      <ModalContent>
        <ModalHeader className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Info size={16} />
          </span>
          {title}
        </ModalHeader>
        <ModalBody>
          <p className="text-sm leading-6 text-default-600 dark:text-white/80">{message}</p>
        </ModalBody>
        <ModalFooter>
          <Button color="primary" onPress={onClose}>
            OK
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

interface AppConfirmDialogProps {
  isOpen: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmColor?: 'danger' | 'primary' | 'warning' | 'success';
  onClose: () => void;
  onConfirm: () => void;
}

export function AppConfirmDialog({
  isOpen,
  title = 'Confirm Action',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmColor = 'danger',
  onClose,
  onConfirm,
}: AppConfirmDialogProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm" backdrop="blur" classNames={appModalClassNames}>
      <ModalContent>
        <ModalHeader className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-warning/15 text-warning">
            <AlertTriangle size={16} />
          </span>
          {title}
        </ModalHeader>
        <ModalBody>
          <p className="text-sm leading-6 text-default-600 dark:text-white/80">{message}</p>
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={onClose}>
            {cancelLabel}
          </Button>
          <Button color={confirmColor} onPress={onConfirm}>
            {confirmLabel}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
