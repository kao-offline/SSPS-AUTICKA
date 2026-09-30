'use client';

import React, { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useAction, useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import {
  Button,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Input,
  Avatar,
  useDisclosure,
  Divider,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from '@heroui/react';
import styles from '../app/dashboard/dashboard.module.css';
import { appModalClassNames } from '@/components/app-dialogs';

interface NavigationItem {
  id: string;
  label: string;
  icon: string;
  permissions?: string[];
}

interface SidebarProps {
  logoSrc?: string;
  navItems: NavigationItem[];
  activePage: string;
  onNavigation: (pageId: string) => void;
  username?: string | null;
  userId?: string | null;
  userImage?: string | null;
  userRole?: string;
  isAdmin?: boolean;
  theme: 'dark' | 'light';
  onThemeToggle?: () => void;
  onLogout?: () => void;
  renderIcon?: (icon: string, itemId?: string) => React.ReactNode;
}

export const DashboardSidebar: React.FC<SidebarProps> = ({
  logoSrc = '/media/logo-v2.svg',
  navItems,
  activePage,
  onNavigation,
  username = 'User',
  userId,
  userImage,
  userRole = 'User',
  isAdmin = false,
  theme = 'dark',
  onThemeToggle,
  onLogout,
  renderIcon = (icon) => <span className={styles.navIcon}>{icon}</span>,
}) => {
  const [displayTheme, setDisplayTheme] = useState(theme);
  const { isOpen, onOpen, onClose } = useDisclosure();

  const isServersNavActive = ['admin-servers', 'admin-server-marketplace', 'admin-server-plugins'].includes(activePage);
  const [serversMenuOpen, setServersMenuOpen] = useState(false);

  // Edit profile state
  const [newUsername, setNewUsername] = useState('');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const updateUsername = useMutation(api.users.updateCurrentUsername);
  const generateUploadUrl = useMutation(api.context.generateUploadUrl);
  const updateImage = useMutation(api.users.updateCurrentImage);
  // Fetch current user's raw usrData so photo upload doesn't wipe it

  useEffect(() => {
    setDisplayTheme(theme);
  }, [theme]);

  const openEdit = () => {
    setNewUsername(username || '');
    setSelectedImage(null);
    setPreviewUrl(null);
    setSaveError(null);
    onOpen();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedImage(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);
    try {
      // Update username if changed
      const trimmed = newUsername.trim();
      if (trimmed && trimmed !== username) {
        await updateUsername({ username: trimmed });
      }

      // Upload new photo if selected (needs userId for updateUserAction)
      if (selectedImage && userId) {
        const postUrl = await generateUploadUrl();
        const result = await fetch(postUrl, {
          method: 'POST',
          headers: { 'Content-Type': selectedImage.type },
          body: selectedImage,
        });
        const { storageId } = await result.json();
        if (!result.ok || !storageId) throw new Error('Image upload failed');
        await updateImage({ image: storageId });
      }

      onClose();
    } catch (err: any) {
      setSaveError(err?.message || 'Failed to save. Try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const avatarSrc = previewUrl || userImage || undefined;

  return (
    <div className={styles.sidebar}>
      {/* Logo Area */}
      <div className={styles.logoContainer}>
        <div className={styles.logo}>
          <Image
            src={logoSrc}
            alt="LockedIN"
            width={340}
            height={220}
            className={styles.logoImage}
            priority
          />
        </div>
      </div>

      {/* Navigation Area */}
      <div className={styles.navigation}>
        <div className={styles.navMenu}>
          {navItems.map((item) => (
            <div className="w-full" key={item.id}>
              <div className="w-full">
                <Button
                  isIconOnly={false}
                  className={`${styles.navItem} ${
                    activePage === item.id ? styles.active : ''
                  }`}
                  onClick={() => onNavigation(item.id)}
                  fullWidth
                  variant={activePage === item.id ? 'solid' : 'light'}
                  color={activePage === item.id ? 'primary' : 'default'}
                >
                  {renderIcon(item.icon, item.id)}
                  <span className={styles.navLabel}>{item.label}</span>
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Admin Section */}
      <div className={styles.adminSection}>
        {/* Management Buttons */}
        {isAdmin && (
  <div className={styles.managementButtons}>
    <div className="w-full">
      <div className="w-full">
        <Button
          className={`${styles.managementButton} ${
            activePage === 'admin-accounts' ? styles.active : ''
          }`}
          onClick={() => onNavigation('admin-accounts')}
          fullWidth
          variant={activePage === 'admin-accounts' ? 'solid' : 'flat'}
          color={activePage === 'admin-accounts' ? 'primary' : 'default'}
        >
          <span className={styles.managementIcon}>
            <img src="/icons/acc-manange-outline.svg" alt="Manage" className={styles.iconOutline} style={{ width: '22px', height: '22px' }} />
            <img src="/icons/acc-manange-full.svg" alt="Manage" className={styles.iconFull} style={{ width: '22px', height: '22px' }} />
          </span>
          <span className={styles.managementLabel}>Manage</span>
        </Button>
      </div>
    </div>

    <div className="w-full">
      <div className="w-full">
        <Button
          className={`${styles.managementButton} ${
            activePage === 'plugin-publisher' ? styles.active : ''
          }`}
          onClick={() => onNavigation('plugin-publisher')}
          fullWidth
          variant={activePage === 'plugin-publisher' ? 'solid' : 'flat'}
          color={activePage === 'plugin-publisher' ? 'primary' : 'default'}
        >
          <span className={styles.managementIcon}>
            <img src="/icons/app-outline.svg" alt="Plugin Publisher" className={styles.iconOutline} style={{ width: '22px', height: '22px' }} />
            <img src="/icons/app-full.svg" alt="Plugin Publisher" className={styles.iconFull} style={{ width: '22px', height: '22px' }} />
          </span>
          <span className={styles.managementLabel}>Publisher</span>
        </Button>
      </div>
    </div>

    <div className="w-full">
      <div className="w-full">
        <Button
          className={`${styles.managementButton} ${
            activePage === 'admin-api-keys' ? styles.active : ''
          }`}
          onClick={() => onNavigation('admin-api-keys')}
          fullWidth
          variant={activePage === 'admin-api-keys' ? 'solid' : 'flat'}
          color={activePage === 'admin-api-keys' ? 'primary' : 'default'}
        >
          <span className={styles.managementIcon}>
            <img src="/icons/key-outline.svg" alt="API Keys" className={styles.iconOutline} style={{ width: '22px', height: '22px' }} />
            <img src="/icons/key-full.svg" alt="API Keys" className={styles.iconFull} style={{ width: '22px', height: '22px' }} />
          </span>
          <span className={styles.managementLabel}>API Keys</span>
        </Button>
      </div>
    </div>

    <div className="w-full">
      <div className="w-full">
        <Dropdown isOpen={serversMenuOpen} onOpenChange={setServersMenuOpen} placement="right-start" className="bg-background border-1 border-default-200">
          <DropdownTrigger>
            <Button
              className={`${styles.managementButton} ${
                isServersNavActive ? styles.active : ''
              }`}
              onClick={() => onNavigation('admin-servers')}
              fullWidth
              variant={isServersNavActive ? 'solid' : 'flat'}
              color={isServersNavActive ? 'primary' : 'default'}
            >
              <span className={styles.managementIcon}>
                <img src="/icons/server-outline.svg" alt="Servers" className={styles.iconOutline} style={{ width: '22px', height: '22px' }} />
                <img src="/icons/server-full.svg" alt="Servers" className={styles.iconFull} style={{ width: '22px', height: '22px' }} />
              </span>
              <span className={styles.managementLabel}>Servers</span>
            </Button>
          </DropdownTrigger>
          <DropdownMenu aria-label="Servers menu" onAction={(key) => onNavigation(String(key))}>
            <DropdownItem key="admin-servers">Servers</DropdownItem>
            <DropdownItem key="admin-server-marketplace">Marketplace</DropdownItem>
            <DropdownItem key="admin-server-plugins">Plugins</DropdownItem>
          </DropdownMenu>
        </Dropdown>
      </div>
    </div>
  </div>
)}

        <div className="w-full border-t border-default-300 dark:border-default-400 my-2" />

        {/* Theme Toggle */}
        <div className="w-full">
          <Button
            className={styles.adminButton}
            onClick={onThemeToggle}
            fullWidth
            variant="light"
            color="default"
          >
            <span className={styles.logoutIcon}>
              <img
                src={displayTheme === 'dark' ? '/icons/light-dark-full.svg' : '/icons/light-dark-line.svg'}
                alt={displayTheme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                style={{ width: '20px', height: '20px' }}
              />
            </span>
            <span className={styles.adminLabel}>
              {displayTheme === 'dark' ? 'Light Mode' : 'Dark Mode'}
            </span>
          </Button>
        </div>

        {/* User Profile Card â€” clickable to edit */}
        <div
          className={styles.profileCard}
          onClick={openEdit}
          title="Edit your profile"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && openEdit()}
          style={{ cursor: 'pointer' }}
        >
          <div className={styles.profileHeader}>
            <span className={styles.profileIcon}>
              {userImage ? (
                <img
                  src={userImage}
                  alt={username || 'Profile'}
                  style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover' }}
                />
              ) : (
                <img
                  src="/icons/acc-full.svg"
                  alt="Profile"
                  style={{ width: '24px', height: '24px' }}
                />
              )}
            </span>
            <div className={styles.profileInfo}>
              <div className={styles.profileUsername}>{username || 'User'}</div>
              <div className={styles.profileRole}>{userRole}</div>
            </div>
          </div>
          <button
            className={styles.logoutAction}
            onClick={(e) => { e.stopPropagation(); onLogout?.(); }}
            title="Logout"
            type="button"
          >
            <img src="/icons/login-full.svg" alt="Logout" style={{ width: '18px', height: '18px' }} />
          </button>
        </div>
      </div>

      {/* Edit Profile Modal */}
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        placement="center"
        backdrop="blur"
        size="sm"
        classNames={appModalClassNames}
      >
        <ModalContent>
          {() => (
            <>
              <ModalHeader className="flex flex-col gap-0.5">
                Edit Profile
                <p className="text-tiny font-normal text-default-500">Change your username or profile picture</p>
              </ModalHeader>
              <ModalBody className="py-6">
                <div className="flex flex-col items-center gap-4">
                  {/* Avatar preview */}
                  <div className="relative">
                    <Avatar
                      src={avatarSrc}
                      name={newUsername || username || 'U'}
                      className="w-20 h-20 text-large cursor-pointer ring-2 ring-offset-2 ring-primary/40 hover:ring-primary transition-all"
                      onClick={() => fileRef.current?.click()}
                    />
                    <button
                      onClick={() => fileRef.current?.click()}
                      className="absolute -bottom-1 -right-1 bg-primary text-white rounded-full w-6 h-6 flex items-center justify-center text-xs shadow-md hover:bg-primary/80 transition-colors"
                      title="Change photo"
                    >
                      âœŽ
                    </button>
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  {selectedImage && (
                    <p className="text-tiny text-default-400">{selectedImage.name}</p>
                  )}
                </div>
                <Divider className="my-2" />
                <Input
                  label="Username"
                  placeholder="Enter your username"
                  variant="bordered"
                  value={newUsername}
                  onValueChange={setNewUsername}
                  autoComplete="off"
                />
                {saveError && (
                  <p className="text-tiny text-danger mt-1">{saveError}</p>
                )}
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose} isDisabled={isSaving}>
                  Cancel
                </Button>
                <Button color="primary" onPress={handleSave} isLoading={isSaving}>
                  Save Changes
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
};

export default DashboardSidebar;
