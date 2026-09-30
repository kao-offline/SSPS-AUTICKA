import { ManagementHeader } from '@/components/management-header';
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useAction, useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useAuth } from '../auth-context';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Divider,
  Input,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
  User as HeroUser,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  RadioGroup,
  Radio,
  CheckboxGroup,
  Checkbox,
  Tooltip,
} from '@heroui/react';
import { AlertBox } from '@/components/heroui-components';
import { AppConfirmDialog, appModalClassNames } from '@/components/app-dialogs';
import {
  FaUser,
  FaShieldAlt,
  FaEllipsisV,
  FaEdit,
  FaTrash,
  FaPlus,
  FaSearch,
  FaCheckCircle,
  FaTimesCircle,
  FaUserShield,
  FaPlug,
  FaKey,
  FaCheck,
  FaTimes
} from 'react-icons/fa';

interface PageProps {
  username?: string;
  userData?: Record<string, unknown>;
}

interface User {
  _id: string;
  username?: string;
  usrData?: string;
  hashPassword?: string;
  email?: string;
  image?: string;
  isApproved?: boolean;
  createdAt?: number;
}

interface PluginItem {
  name: string;
  description?: string;
}

interface ParsedUserData {
  role: string;
  createdAt?: string;
  isActive?: boolean;
  plugins: string;
}

interface FeedbackState {
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
}

const parseUserData = (value?: string): ParsedUserData => {
  try {
    const parsed = value ? JSON.parse(value) : {};
    return {
      role: parsed.role || 'user',
      createdAt: parsed.createdAt,
      isActive: parsed.isActive !== false, // Default to true if not specified
      plugins: parsed.plugins || '',
    };
  } catch {
    return {
      role: 'user',
      isActive: true,
      plugins: '',
    };
  }
};

export const AdminAccountManagementPage: React.FC<PageProps> = ({ username }) => {
  const { isOpen, onOpen, onOpenChange, onClose } = useDisclosure();
  const { isOpen: isPhotoOpen, onOpen: onPhotoOpen, onOpenChange: onPhotoOpenChange, onClose: onPhotoClose } = useDisclosure();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPhotoSubmitting, setIsPhotoSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [photoTarget, setPhotoTarget] = useState<User | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [confirmState, setConfirmState] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    role: 'user',
    plugins: [] as string[],
  });

  // Get refreshUserData from auth context
  const { refreshUserData, username: currentUsername } = useAuth();

  // Get all users and plugins
  const allUsers = useQuery(api.context.getAllUsers);
  const allPlugins = useQuery(api.context.getAllPlugins);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createUserAction = useAction((api.context as any).createUserAction);
  const updateUserAction = useAction(api.context.updateUserAction);
  const deleteUserAction = useAction(api.context.deleteUserAction);
  const approveAccount = useMutation(api.context.approveAccount);
  const rejectAccount = useMutation(api.context.rejectAccount);
  const generateUploadUrl = useMutation(api.context.generateUploadUrl);

  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const filteredUsers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) {
      return users;
    }
    return users.filter((user) => (user.username || '').toLowerCase().includes(term));
  }, [users, searchTerm]);


  const userStats = useMemo(() => {
    const adminCount = users.filter((user) => parseUserData(user.usrData).role === 'admin').length;
    const activeCount = users.filter((user) => parseUserData(user.usrData).isActive !== false).length;
    return {
      total: users.length,
      admins: adminCount,
      active: activeCount,
    };
  }, [users]);

  const resetForm = useCallback(() => {
    setFormData({
      username: '',
      password: '',
      role: 'user',
      plugins: [],
    });
    setEditingUser(null);
    setSelectedImage(null);
  }, []);

  // Function to refresh current user's data from database
  const refreshCurrentUserData = async () => {
    if (currentUsername) {
      try {
        const updatedUser = allUsers?.find(user => user.username === currentUsername);
        if (updatedUser) {
          const storedAuth = localStorage.getItem('authData');
          if (storedAuth) {
            const authData = JSON.parse(storedAuth);
            const updatedAuthData = {
              ...authData,
              userData: updatedUser.usrData,
              timestamp: Date.now()
            };
            localStorage.setItem('authData', JSON.stringify(updatedAuthData));
          }
        }
        if (typeof window !== 'undefined' && (window as unknown as Record<string, unknown>).refreshDashboard) {
          (((window as unknown as Record<string, unknown>).refreshDashboard) as () => void)();
        }
        refreshUserData();
      } catch (error) {
        console.error('Error refreshing current user data:', error);
      }
    }
  };

  useEffect(() => {
    if (allUsers) {
      setUsers(allUsers);
      setIsLoading(false);
    }
  }, [allUsers]);

  const handleOpenModal = (user?: User) => {
    if (user) {
      const userData = parseUserData(user.usrData);
      const selectedPlugins = userData.plugins
        .split(',')
        .map((name: string) => name.trim())
        .filter(Boolean);

      setFormData({
        username: user.username || '',
        password: '',
        role: userData.role || 'user',
        plugins: selectedPlugins,
      });
      setEditingUser(user);
    } else {
      resetForm();
    }
    setSelectedImage(null);
    onOpen();
  };

  const handleSubmitUser = async () => {
    if (!editingUser && (!formData.username || !formData.password)) {
      setFeedback({
        type: 'warning',
        message: 'Please enter both username and password for a new user.',
      });
      return;
    }

    if (!formData.username.trim()) {
      setFeedback({
        type: 'warning',
        message: 'Username is required.',
      });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    try {
      let imageUrl = editingUser?.image;

      // Handle image upload if a new image was selected
      if (selectedImage) {
        const postUrl = await generateUploadUrl();
        const result = await fetch(postUrl, {
          method: "POST",
          headers: { "Content-Type": selectedImage.type },
          body: selectedImage,
        });
        const { storageId } = await result.json();
        imageUrl = storageId;
      }

      const previousUserData = editingUser ? parseUserData(editingUser.usrData) : null;
      const userData = JSON.stringify({
        role: formData.role,
        createdAt: previousUserData?.createdAt || new Date().toISOString(),
        isActive: true,
        plugins: formData.plugins.join(','),
      });

      if (editingUser) {
        await updateUserAction({
          userId: editingUser._id,
          username: formData.username !== editingUser.username ? formData.username : undefined,
          password: formData.password ? formData.password : undefined,
          image: imageUrl,
          usrData: userData
        });
        setFeedback({ type: 'success', message: 'User updated successfully.' });
      } else {
        await createUserAction({
          username: formData.username,
          password: formData.password,
          usrData: userData
        });
        setFeedback({ type: 'success', message: 'User created successfully.' });
      }

      onClose();
      resetForm();
      setSelectedImage(null);
      refreshUserData();

      if (editingUser && editingUser.username === currentUsername) {
        refreshCurrentUserData();
      }
    } catch (error) {
      console.error('Error saving user:', error);
      setFeedback({ type: 'error', message: 'Error saving user. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteUser = async (user: User) => {
    if (user.username === username) return;

    setConfirmState({
      message: `Are you sure you want to delete ${user.username}?`,
      onConfirm: async () => {
        try {
          await deleteUserAction({ userId: user._id });
          refreshUserData();
          setFeedback({ type: 'success', message: 'User deleted successfully.' });
        } catch (error) {
          console.error('Error deleting user:', error);
          setFeedback({ type: 'error', message: 'Error deleting user. Please try again.' });
        } finally {
          setConfirmState(null);
        }
      },
    });
  };

  const handleApproveUser = async (user: User) => {
    try {
      setIsSubmitting(true);
      await approveAccount({ userId: user._id as any });
      setFeedback({ type: 'success', message: `User ${user.username} approved successfully.` });
      refreshUserData();
    } catch (error) {
      console.error('Error approving user:', error);
      setFeedback({ type: 'error', message: 'Error approving user. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRejectUser = async (user: User) => {
    setConfirmState({
      message: `Are you sure you want to reject and delete ${user.username}?`,
      onConfirm: async () => {
        try {
          setIsSubmitting(true);
          await rejectAccount({ userId: user._id as any });
          setFeedback({ type: 'success', message: `User ${user.username} rejected and deleted.` });
          refreshUserData();
        } catch (error) {
          console.error('Error rejecting user:', error);
          setFeedback({ type: 'error', message: 'Error rejecting user. Please try again.' });
        } finally {
          setIsSubmitting(false);
          setConfirmState(null);
        }
      },
    });
  };

  const renderCell = useCallback((user: User, columnKey: React.Key) => {
    const userData = parseUserData(user.usrData);
    const plugins = userData.plugins
      .split(',')
      .map((name: string) => name.trim())
      .filter(Boolean);

    switch (columnKey) {
      case "user":
        return (
          <HeroUser
            avatarProps={{
              radius: "lg",
              src: (user as any).imageUrl || undefined,
              fallback: <FaUser className="text-default-500" />
            }}
            description={user.email || `@${user.username}`}
            name={user.username}
          >
            {user.username}
          </HeroUser>
        );
      case "role":
        return (
          <Chip
            className="capitalize border-none gap-1 text-default-600"
            color={userData.role === 'admin' ? "secondary" : "default"}
            size="sm"
            variant="flat"
            startContent={userData.role === 'admin' ? <FaUserShield size={12} /> : <FaUser size={12} />}
          >
            {userData.role}
          </Chip>
        );
      case "status":
        return (
          <Chip
            className="capitalize"
            color={user.isApproved === false ? "warning" : (userData.isActive ? "success" : "danger")}
            size="sm"
            variant="flat"
            startContent={user.isApproved === false ? <Spinner size="sm" color="warning" className="scale-75" /> : (userData.isActive ? <FaCheckCircle size={12} /> : <FaTimesCircle size={12} />)}
          >
            {user.isApproved === false ? "Pending" : (userData.isActive ? "Active" : "Inactive")}
          </Chip>
        );
      case "plugins":
        return (
          <div className="flex flex-wrap gap-1 max-w-[200px]">
            {plugins.length > 0 ? (
              <>
                {plugins.slice(0, 2).map((p) => (
                  <Chip key={p} size="sm" variant="dot" color="primary" className="border-none">
                    {p}
                  </Chip>
                ))}
                {plugins.length > 2 && (
                  <Tooltip content={plugins.slice(2).join(", ")}>
                    <Chip size="sm" variant="flat">+{plugins.length - 2}</Chip>
                  </Tooltip>
                )}
              </>
            ) : (
              <span className="text-tiny text-default-500">No plugins</span>
            )}
          </div>
        );
      case "actions":
        if (user.isApproved === false) {
          return (
            <div className="flex gap-2 justify-end">
              <Button
                isIconOnly
                size="sm"
                color="success"
                variant="flat"
                onClick={() => handleApproveUser(user)}
                isLoading={isSubmitting}
              >
                <FaCheck />
              </Button>
              <Button
                isIconOnly
                size="sm"
                color="danger"
                variant="flat"
                onClick={() => handleRejectUser(user)}
                isLoading={isSubmitting}
              >
                <FaTimes />
              </Button>
            </div>
          );
        }
        return (
          <div className="relative flex justify-end items-center gap-2">
            <Dropdown className="bg-background border-1 border-default-200">
              <DropdownTrigger>
                <Button isIconOnly radius="full" size="sm" variant="light">
                  <FaEllipsisV className="text-default-500" />
                </Button>
              </DropdownTrigger>
              <DropdownMenu aria-label="Action menu" disabledKeys={user.username === username ? ["delete"] : []}>
                <DropdownItem
                  key="edit"
                  startContent={<FaEdit />}
                  onClick={() => handleOpenModal(user)}
                >
                  Edit User
                </DropdownItem>
                <DropdownItem
                  key="photo"
                  startContent={<FaUser />}
                  onClick={() => {
                    setPhotoTarget(user);
                    setSelectedImage(null);
                    onPhotoOpen();
                  }}
                >
                  Change Photo
                </DropdownItem>
                <DropdownItem
                  key="delete"
                  className="text-danger"
                  color="danger"
                  startContent={<FaTrash />}
                  onClick={() => handleDeleteUser(user)}
                >
                  Delete User
                </DropdownItem>
              </DropdownMenu>
            </Dropdown>
          </div>
        );
      default:
        return null;
    }
  }, [username, handleOpenModal, handleDeleteUser]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Spinner size="lg" label="Loading Account Management..." color="primary" labelColor="primary" />
      </div>
    );
  }

  return (
    <div className="management-page">
      <ManagementHeader title="Accounts" summary={<>
        <span>{userStats.total} {userStats.total === 1 ? 'account' : 'accounts'}</span>
        {users.some(user => user.isApproved === false) && <Chip size="sm" variant="flat" color="warning">{users.filter(user => user.isApproved === false).length} pending</Chip>}
      </>} actions={<Button color="primary" startContent={<FaPlus />} onPress={() => handleOpenModal()}>New account</Button>} />

      {feedback && (
        <AlertBox
          type={feedback.type}
          message={feedback.message}
          onClose={() => setFeedback(null)}
        />
      )}

      {/* Main Table Card */}
      <Card className="management-panel">
        <CardHeader className="flex flex-col sm:flex-row gap-4 items-center justify-between px-6 py-4">
          <div className="relative w-full sm:w-72">
            <Input
              isClearable
              aria-label="Search accounts"
              placeholder="Search accounts"
              size="sm"
              startContent={<FaSearch className="text-default-500" />}
              value={searchTerm}
              onValueChange={setSearchTerm}
              variant="bordered"
              className="w-full"
            />
          </div>
          <p className="text-default-500 text-small">{filteredUsers.length} results</p>
        </CardHeader>
        <Divider />
        <CardBody className="p-0">
          <Table
            aria-label="User accounts table"
            removeWrapper
            selectionMode="none"
            classNames={{
              th: ["bg-transparent", "text-default-500", "border-b", "border-divider"],
              td: ["py-4"]
            }}
          >
            <TableHeader>
              <TableColumn key="user">USER</TableColumn>
              <TableColumn key="role">ROLE</TableColumn>
              <TableColumn key="status">STATUS</TableColumn>
              <TableColumn key="plugins">PLUGINS</TableColumn>
              <TableColumn key="actions" align="end">ACTIONS</TableColumn>
            </TableHeader>
            <TableBody
              emptyContent={"No users found matching your search."}
              items={filteredUsers}
            >
              {(item) => (
                <TableRow key={item._id}>
                  {(columnKey) => <TableCell>{renderCell(item, columnKey)}</TableCell>}
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardBody>
      </Card>

      {/* Create/Edit User Modal */}
      <Modal
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        placement="center"
        backdrop="blur"
        size="md"
        scrollBehavior="inside"
        classNames={appModalClassNames}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                {editingUser ? "Edit account" : "New account"}

              </ModalHeader>
              <ModalBody className="py-6">
                <div className="flex flex-col gap-6">
                  <div className="flex flex-col gap-4">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                       <FaUser className="text-primary" /> Account details
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Input
                        label="Username"
                        placeholder="Enter username"
                        variant="bordered"
                        value={formData.username}
                        onValueChange={(val) => setFormData(p => ({ ...p, username: val }))}
                        isRequired
                      />
                      <Input
                        label="Password"
                        placeholder={editingUser ? "Leave empty to keep current" : "Enter password"}
                        type="password"
                        variant="bordered"
                        value={formData.password}
                        onValueChange={(val) => setFormData(p => ({ ...p, password: val }))}
                        isRequired={!editingUser}
                      />
                    </div>
                  </div>

                  <Divider />

                  <div className="flex flex-col gap-4">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                       <FaShieldAlt className="text-secondary" /> Role
                    </h3>
                    <RadioGroup
                      label="Select User Role"
                      orientation="horizontal"
                      value={formData.role}
                      onValueChange={(val) => setFormData(p => ({ ...p, role: val }))}
                    >
                      <Radio
                        value="user"
                        description="Access to basic dashboard features"
                        classNames={{
                          base: "inline-flex m-0 bg-content2 hover:bg-content3 items-center justify-between flex-row-reverse max-w-full cursor-pointer rounded-lg gap-4 p-4 border-2 border-transparent data-[selected=true]:border-primary",
                        }}
                      >
                        Standard User
                      </Radio>
                      <Radio
                        value="admin"
                        description="Full administrative access"
                        classNames={{
                          base: "inline-flex m-0 bg-content2 hover:bg-content3 items-center justify-between flex-row-reverse max-w-full cursor-pointer rounded-lg gap-4 p-4 border-2 border-transparent data-[selected=true]:border-primary",
                        }}
                      >
                        Administrator
                      </Radio>
                      <Radio
                        value="dev"
                        description="Developer access & tools"
                        classNames={{
                          base: "inline-flex m-0 bg-content2 hover:bg-content3 items-center justify-between flex-row-reverse max-w-full cursor-pointer rounded-lg gap-4 p-4 border-2 border-transparent data-[selected=true]:border-primary",
                        }}
                      >
                        DEV - Developer
                      </Radio>
                    </RadioGroup>
                  </div>

                  <Divider />

                  <div className="flex flex-col gap-4">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                       <FaPlug className="text-success" /> Plugin access
                    </h3>
                    <CheckboxGroup
                      label="Plugins"
                      orientation="horizontal"
                      value={formData.plugins}
                      onValueChange={(val) => setFormData(p => ({ ...p, plugins: val as string[] }))}
                      className="gap-2"
                    >
                      <div className="flex flex-wrap gap-2">
                        {(allPlugins as PluginItem[] | undefined)?.map((plugin) => (
                          <Checkbox
                            key={plugin.name}
                            value={plugin.name}
                            classNames={{
                              base: "inline-flex bg-content2 hover:bg-content3 items-center justify-start cursor-pointer rounded-lg gap-2 p-2 px-3 border-2 border-transparent data-[selected=true]:border-success",
                              label: "text-tiny",
                            }}
                          >
                            {plugin.name}
                          </Checkbox>
                        ))}
                      </div>
                    </CheckboxGroup>
                    {!(allPlugins as any)?.length && (
                      <p className="text-tiny text-default-500 italic">No plugins available in the system.</p>
                    )}
                  </div>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  Cancel
                </Button>
                <Button
                  color="primary"
                  onPress={handleSubmitUser}
                  isLoading={isSubmitting}
                >
                  {editingUser ? "Save Changes" : "Create Account"}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Change Photo Modal */}
      <Modal
        isOpen={isPhotoOpen}
        onOpenChange={onPhotoOpenChange}
        placement="center"
        backdrop="blur"
        size="sm"
        classNames={appModalClassNames}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                Edit Profile Picture
                <p className="text-tiny font-normal text-default-500">
                  {photoTarget?.username ? `Update photo for ${photoTarget.username}` : ''}
                </p>
              </ModalHeader>
              <ModalBody className="py-6">
                <div className="flex flex-col items-center gap-5">
                  <div className="relative group">
                    <HeroUser
                      name={photoTarget?.username || ''}
                      avatarProps={{
                        src: selectedImage
                          ? URL.createObjectURL(selectedImage)
                          : ((photoTarget as any)?.imageUrl || undefined),
                        size: "lg",
                        className: "w-24 h-24 text-large cursor-pointer transition-opacity group-hover:opacity-70",
                        onClick: () => fileInputRef.current?.click(),
                      }}
                    />
                  </div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) setSelectedImage(file);
                    }}
                  />
                  <Button
                    size="sm"
                    variant="flat"
                    onClick={() => fileInputRef.current?.click()}
                    startContent={<FaPlus />}
                  >
                    {selectedImage || photoTarget?.image ? 'Change Photo' : 'Upload Photo'}
                  </Button>
                  {selectedImage && (
                    <p className="text-tiny text-default-500 text-center">{selectedImage.name}</p>
                  )}
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={() => { setSelectedImage(null); onPhotoClose(); }}>
                  Cancel
                </Button>
                <Button
                  color="primary"
                  isLoading={isPhotoSubmitting}
                  onPress={async () => {
                    if (!selectedImage || !photoTarget) return;
                    setIsPhotoSubmitting(true);
                    try {
                      const postUrl = await generateUploadUrl();
                      const result = await fetch(postUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': selectedImage.type },
                        body: selectedImage,
                      });
                      const { storageId } = await result.json();
                      const previousUserData = parseUserData(photoTarget.usrData);
                      await updateUserAction({
                        userId: photoTarget._id,
                        image: storageId,
                        usrData: JSON.stringify({
                          role: previousUserData.role,
                          createdAt: previousUserData.createdAt,
                          isActive: previousUserData.isActive,
                          plugins: previousUserData.plugins,
                        }),
                      });
                      setFeedback({ type: 'success', message: `Photo updated for ${photoTarget.username}.` });
                      refreshUserData();
                      if (photoTarget.username === currentUsername) {
                        refreshCurrentUserData();
                      }
                      setSelectedImage(null);
                      onPhotoClose();
                    } catch (err) {
                      console.error(err);
                      setFeedback({ type: 'error', message: 'Failed to update photo.' });
                    } finally {
                      setIsPhotoSubmitting(false);
                    }
                  }}
                >
                  Save Photo
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      <AppConfirmDialog
        isOpen={Boolean(confirmState)}
        onClose={() => setConfirmState(null)}
        message={confirmState?.message || ''}
        onConfirm={() => confirmState?.onConfirm()}
      />
    </div>
  );
};
