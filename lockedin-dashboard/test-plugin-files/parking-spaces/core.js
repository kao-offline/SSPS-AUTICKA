class ParkingSpacesPlugin {
  constructor() {
    this.sdk = null;
    this.context = null;
    this.root = null;
    this.container = null;
    this.initError = null;
  }

  createDefaultConfig() {
    return {
      version: 3,
      mapFileName: null,
      mapMeta: null,
      spaces: [],
      updatedAt: Date.now(),
    };
  }

  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  normalizeSpace(space, index) {
    const fallbackLabel = String(index + 1);
    const normalized = {
      id: space.id || `space_${Date.now()}_${index}`,
      name: space.name || `space-${fallbackLabel}`,
      label: space.label || fallbackLabel,
      x: typeof space.x === 'number' ? space.x : 10,
      y: typeof space.y === 'number' ? space.y : 10,
      width: typeof space.width === 'number' ? space.width : 7,
      height: typeof space.height === 'number' ? space.height : 11,
      angle: typeof space.angle === 'number' ? space.angle : 0,
      radius: typeof space.radius === 'number' ? space.radius : 12,
      isFull: Boolean(space.isFull),
      updatedAt: typeof space.updatedAt === 'number' ? space.updatedAt : Date.now(),
    };

    normalized.width = this.clamp(normalized.width, 0.8, 40);
    normalized.height = this.clamp(normalized.height, 1.2, 40);
    normalized.radius = this.clamp(normalized.radius, 0, 40);
    normalized.x = this.clamp(normalized.x, 0, 100 - normalized.width);
    normalized.y = this.clamp(normalized.y, 0, 100 - normalized.height);

    return normalized;
  }

  async initialize(context) {
    this.context = context;
    this.sdk = this.resolveSdk(context);

    if (!this.sdk) {
      this.initError = 'Plugin SDK not available';
      console.error('[parking-spaces] Plugin SDK not available');
      return;
    }

    if (typeof this.sdk.registerApiEndpoints === 'function') {
      await this.sdk.registerApiEndpoints(['getSpaces', 'getMap', 'updateSpaceStatus']);
    }
  }

  resolveSdk(context) {
    const globalSdk = window.PluginSDK;

    if (globalSdk && typeof globalSdk.getData === 'function') {
      return globalSdk;
    }

    if (globalSdk && typeof globalSdk.createPluginSDK === 'function') {
      return globalSdk.createPluginSDK({
        pluginName: 'parking-spaces',
        convexClient: context.convexClient,
        username: context.username,
        userData: context.userData,
      });
    }

    if (context && typeof context.sdkFactory === 'function') {
      return context.sdkFactory({
        pluginName: 'parking-spaces',
        convexClient: context.convexClient,
        username: context.username,
        userData: context.userData,
      });
    }

    return null;
  }

  async loadConfig() {
    const saved = this.sdk ? await this.sdk.getData('parking-config') : null;
    const rawSpaces = Array.isArray(saved && saved.spaces) ? saved.spaces : [];
    const config = {
      ...this.createDefaultConfig(),
      ...(saved && typeof saved === 'object' ? saved : {}),
      spaces: rawSpaces.map((space, index) => this.normalizeSpace(space, index)),
    };

    const mapUrl = config.mapFileName && this.sdk
      ? await this.loadMapUrl(config.mapFileName)
      : null;

    return {
      ...config,
      mapUrl,
    };
  }

  async loadMapUrl(mapFileName) {
    if (!this.sdk || !mapFileName) {
      return null;
    }

    try {
      const file = await this.sdk.getFileUrl(mapFileName);
      return file && file.url ? file.url : null;
    } catch (error) {
      this.sdk.error('Failed to load parking map', error);
      return null;
    }
  }

  async saveConfig(config) {
    if (!this.sdk) {
      return;
    }

    const payload = {
      ...config,
      mapUrl: null,
      spaces: (config.spaces || []).map((space, index) => this.normalizeSpace(space, index)),
      updatedAt: Date.now(),
    };
    await this.sdk.setData('parking-config', payload);
  }

  async uploadMap(file) {
    if (!this.sdk || !file) {
      return null;
    }

    const dataUrl = await this.readFileAsDataUrl(file);
    await this.sdk.storeFile('parking-map', dataUrl, file.type || 'image/png', {
      originalName: file.name,
      uploadedAt: Date.now(),
    });

    const mapUrl = await this.loadMapUrl('parking-map');
    return {
      mapFileName: 'parking-map',
      mapMeta: {
        originalName: file.name,
        size: file.size,
        type: file.type || 'image/png',
        uploadedAt: Date.now(),
      },
      mapUrl,
    };
  }

  readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  isAdminFromSource(source) {
    if (!source || typeof source !== 'object') {
      return false;
    }

    if (source.role === 'admin') {
      return true;
    }

    if (source.userData && typeof source.userData === 'object' && source.userData.role === 'admin') {
      return true;
    }

    if (source.usrData && typeof source.usrData === 'object' && source.usrData.role === 'admin') {
      return true;
    }

    if (typeof source.usrData === 'string') {
      try {
        const parsed = JSON.parse(source.usrData);
        return parsed && parsed.role === 'admin';
      } catch {
        return false;
      }
    }

    return false;
  }

  createUI(container) {
    const runtime = this.context?.runtime || window.PluginRuntime || (window.parent && window.parent.PluginRuntime);
    if (!runtime) {
      container.innerHTML = '<div style="padding:16px;color:#ef4444">PluginRuntime not available.</div>';
      return;
    }

    const { React, ReactDOMClient, HeroUI } = runtime;
    if (!React || !ReactDOMClient || !HeroUI) {
      container.innerHTML = '<div style="padding:16px;color:#ef4444">React/HeroUI runtime not available.</div>';
      return;
    }

    const { createElement: e } = React;
    const { Button, Card, Input, Badge } = HeroUI;
    const plugin = this;

    const App = () => {
      const [config, setConfig] = React.useState(plugin.createDefaultConfig());
      const [loading, setLoading] = React.useState(true);
      const [saving, setSaving] = React.useState(false);
      const [error, setError] = React.useState(plugin.initError);
      const [isAdmin, setIsAdmin] = React.useState(false);
      const [selectedId, setSelectedId] = React.useState(null);
      const [assetUrls, setAssetUrls] = React.useState({ map: null, upload: null, status: null });
      const fileInputRef = React.useRef(null);
      const mapStageRef = React.useRef(null);
      const dragRef = React.useRef(null);
      const clipboardRef = React.useRef(null);
      const historyRef = React.useRef([]);
      const configRef = React.useRef(config);
      const lastSnapshotRef = React.useRef('');

      const snapshotOf = React.useRef((nextConfig) => JSON.stringify({
        mapFileName: nextConfig.mapFileName,
        mapMeta: nextConfig.mapMeta,
        spaces: nextConfig.spaces,
      })).current;

      const cloneConfig = React.useRef((sourceConfig) => ({
        ...sourceConfig,
        mapMeta: sourceConfig.mapMeta ? { ...sourceConfig.mapMeta } : null,
        spaces: (sourceConfig.spaces || []).map((space) => ({ ...space })),
      })).current;

      const pushHistorySnapshot = React.useRef(() => {
        const snapshot = cloneConfig(configRef.current);
        const serialized = snapshotOf(snapshot);
        const history = historyRef.current;
        if (history.length > 0 && snapshotOf(history[history.length - 1]) === serialized) {
          return;
        }

        history.push(snapshot);
        if (history.length > 60) {
          history.shift();
        }
      }).current;

      React.useEffect(() => {
        configRef.current = config;
      }, [config]);

      const persist = React.useRef(async (nextConfig) => {
        setSaving(true);
        try {
          await plugin.saveConfig(nextConfig);
          lastSnapshotRef.current = snapshotOf(nextConfig);
        } catch (persistError) {
          setError(persistError instanceof Error ? persistError.message : 'Failed to save parking config');
        } finally {
          setSaving(false);
        }
      }).current;

      React.useEffect(() => {
        let active = true;
        const boot = async () => {
          try {
            if (!plugin.sdk) {
              throw new Error('Plugin SDK not available');
            }

            const user = await plugin.sdk.getCurrentUser();
            const admin = await plugin.sdk.hasRole('admin');
            const loaded = await plugin.loadConfig();
            if (!active) {
              return;
            }

            setIsAdmin(Boolean(
              admin ||
              plugin.isAdminFromSource(user) ||
              plugin.isAdminFromSource(plugin.context?.userData) ||
              plugin.isAdminFromSource(plugin.context)
            ));
            setConfig(loaded);
            configRef.current = loaded;
            historyRef.current = [];
            setSelectedId(loaded.spaces[0] ? loaded.spaces[0].id : null);
            lastSnapshotRef.current = snapshotOf(loaded);
            setError(null);
          } catch (bootError) {
            if (active) {
              setError(bootError instanceof Error ? bootError.message : 'Failed to load parking plugin');
            }
          } finally {
            if (active) {
              setLoading(false);
            }
          }
        };

        boot();
        return () => {
          active = false;
        };
      }, []);

      React.useEffect(() => {
        let active = true;
        const loadAssets = async () => {
          if (!plugin.sdk || typeof plugin.sdk.getAssetUrl !== 'function') {
            return;
          }

          try {
            const map = await plugin.sdk.getAssetUrl('map.svg');
            const upload = await plugin.sdk.getAssetUrl('upload.svg');
            const status = await plugin.sdk.getAssetUrl('status.svg');
            if (active) {
              setAssetUrls({ map, upload, status });
            }
          } catch {
            // assets optional
          }
        };

        loadAssets();
        return () => {
          active = false;
        };
      }, []);

      React.useEffect(() => {
        if (!plugin.sdk) {
          return undefined;
        }

        const interval = setInterval(async () => {
          try {
            const latest = await plugin.loadConfig();
            const nextSnapshot = snapshotOf(latest);
            if (nextSnapshot !== lastSnapshotRef.current) {
              setConfig(latest);
              configRef.current = latest;
              historyRef.current = [];
              lastSnapshotRef.current = nextSnapshot;
            }
          } catch {
            // ignore polling failures
          }
        }, 4000);

        return () => clearInterval(interval);
      }, []);

      const counts = React.useMemo(() => {
        const total = config.spaces.length;
        const occupied = config.spaces.filter((space) => space.isFull).length;
        return {
          total,
          occupied,
          available: total - occupied,
        };
      }, [config]);

      const selectedSpace = React.useMemo(
        () => config.spaces.find((space) => space.id === selectedId) || null,
        [config, selectedId]
      );

      const setNextConfig = async (nextConfig) => {
        setConfig(nextConfig);
        configRef.current = nextConfig;
        await persist(nextConfig);
      };

      const undoLastChange = async () => {
        const previous = historyRef.current.pop();
        if (!previous) {
          return;
        }

        const restored = cloneConfig(previous);
        setConfig(restored);
        configRef.current = restored;
        setSelectedId(restored.spaces.some((space) => space.id === selectedId) ? selectedId : (restored.spaces[0] ? restored.spaces[0].id : null));
        await persist(restored);
      };

      const handleMapUpload = async (event) => {
        const file = event.target.files && event.target.files[0];
        if (!file) {
          return;
        }

        try {
          pushHistorySnapshot();
          setSaving(true);
          const uploaded = await plugin.uploadMap(file);
          const nextConfig = { ...configRef.current, ...uploaded };
          await setNextConfig(nextConfig);
          setError(null);
        } catch (uploadError) {
          setError(uploadError instanceof Error ? uploadError.message : 'Failed to upload map');
        } finally {
          setSaving(false);
          event.target.value = '';
        }
      };

      const createNewSpace = async () => {
        if (!isAdmin) {
          return;
        }

        pushHistorySnapshot();
        const count = configRef.current.spaces.length + 1;
        const newSpace = plugin.normalizeSpace({
          id: `space_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name: `space-${count}`,
          label: String(count),
          x: 45,
          y: 44,
          width: 4,
          height: 6,
          angle: 0,
          radius: 8,
          isFull: false,
          updatedAt: Date.now(),
        }, count - 1);

        const nextConfig = {
          ...configRef.current,
          spaces: [...configRef.current.spaces, newSpace],
        };
        setSelectedId(newSpace.id);
        await setNextConfig(nextConfig);
      };

      const updateSelectedField = async (field, value) => {
        const currentSelected = configRef.current.spaces.find((space) => space.id === selectedId);
        if (!currentSelected) {
          return;
        }

        pushHistorySnapshot();

        const nextSpaces = configRef.current.spaces.map((space, index) => {
          if (space.id !== currentSelected.id) {
            return space;
          }

          const next = { ...plugin.normalizeSpace(space, index), updatedAt: Date.now() };
          if (field === 'name' || field === 'label') {
            next[field] = value;
          } else if (field === 'isFull') {
            next.isFull = value === 'true' || value === true;
          } else {
            const numeric = Number(value);
            if (Number.isNaN(numeric)) {
              return next;
            }
            if (field === 'radius') next.radius = plugin.clamp(numeric, 0, 40);
          }
          return plugin.normalizeSpace(next, index);
        });

        await setNextConfig({ ...configRef.current, spaces: nextSpaces });
      };

      const toggleSelectedStatus = async () => {
        if (!selectedSpace) {
          return;
        }
        await updateSelectedField('isFull', !selectedSpace.isFull);
      };

      const deleteSelectedSpace = async () => {
        if (!selectedSpace) {
          return;
        }

        pushHistorySnapshot();
        const nextSpaces = configRef.current.spaces.filter((space) => space.id !== selectedSpace.id);
        setSelectedId(nextSpaces[0] ? nextSpaces[0].id : null);
        await setNextConfig({ ...configRef.current, spaces: nextSpaces });
      };

      const duplicateSelectedSpace = () => {
        const currentSelected = configRef.current.spaces.find((space) => space.id === selectedId);
        if (!currentSelected) {
          return;
        }

        clipboardRef.current = { ...currentSelected };
      };

      const pasteCopiedSpace = async () => {
        if (!clipboardRef.current) {
          return;
        }

        pushHistorySnapshot();
        const copied = clipboardRef.current;
        const count = configRef.current.spaces.length + 1;
        const pastedSpace = plugin.normalizeSpace({
          ...copied,
          id: `space_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          x: copied.x + 2,
          y: copied.y + 2,
          name: `${copied.name || 'space'}-copy`,
          updatedAt: Date.now(),
        }, count - 1);

        const nextConfig = {
          ...configRef.current,
          spaces: [...configRef.current.spaces, pastedSpace],
        };

        setSelectedId(pastedSpace.id);
        await setNextConfig(nextConfig);
      };

      const getAngleDifference = (firstAngle, secondAngle) => {
        const raw = ((firstAngle - secondAngle + 540) % 360) - 180;
        return Math.abs(raw);
      };

      const alignSelectedSpace = async () => {
        const currentSelected = configRef.current.spaces.find((space) => space.id === selectedId);
        if (!currentSelected) {
          return;
        }

        const currentCenterX = currentSelected.x + (currentSelected.width / 2);
        const currentCenterY = currentSelected.y + (currentSelected.height / 2);
        const candidates = configRef.current.spaces
          .filter((space) => space.id !== currentSelected.id)
          .map((space) => {
            const angle = space.angle || 0;
            const angleDiff = getAngleDifference(angle, currentSelected.angle || 0);
            if (angleDiff > 8) {
              return null;
            }

            const angleRad = angle * Math.PI / 180;
            const axisX = Math.cos(angleRad);
            const axisY = Math.sin(angleRad);
            const perpX = -Math.sin(angleRad);
            const perpY = Math.cos(angleRad);
            const otherCenterX = space.x + (space.width / 2);
            const otherCenterY = space.y + (space.height / 2);
            const deltaX = currentCenterX - otherCenterX;
            const deltaY = currentCenterY - otherCenterY;
            const perpendicularOffset = (deltaX * perpX) + (deltaY * perpY);
            const parallelOffset = (deltaX * axisX) + (deltaY * axisY);

            return {
              space,
              perpendicularOffset,
              parallelOffset,
            };
          })
          .filter(Boolean)
          .sort((a, b) => Math.abs(a.perpendicularOffset) - Math.abs(b.perpendicularOffset));

        const bestMatch = candidates[0];
        if (!bestMatch) {
          return;
        }

        pushHistorySnapshot();
        const angleRad = (bestMatch.space.angle || 0) * Math.PI / 180;
        const perpX = -Math.sin(angleRad);
        const perpY = Math.cos(angleRad);
        const nextCenterX = currentCenterX - (bestMatch.perpendicularOffset * perpX);
        const nextCenterY = currentCenterY - (bestMatch.perpendicularOffset * perpY);

        const nextSpaces = configRef.current.spaces.map((space, index) => {
          if (space.id !== currentSelected.id) {
            return space;
          }

          const next = plugin.normalizeSpace({
            ...space,
            x: plugin.clamp(nextCenterX - (space.width / 2), 0, 100 - space.width),
            y: plugin.clamp(nextCenterY - (space.height / 2), 0, 100 - space.height),
            angle: bestMatch.space.angle,
            updatedAt: Date.now(),
          }, index);

          return next;
        });

        await setNextConfig({ ...configRef.current, spaces: nextSpaces });
      };

      React.useEffect(() => {
        const onKeyDown = (event) => {
          if (!isAdmin) {
            return;
          }

          const target = event.target;
          const tagName = target && target.tagName ? String(target.tagName).toUpperCase() : '';
          const isTypingTarget = target && (target.isContentEditable || tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT');
          if (isTypingTarget) {
            return;
          }

          if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'c') {
            event.preventDefault();
            duplicateSelectedSpace();
            return;
          }

          if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'v') {
            event.preventDefault();
            pasteCopiedSpace();
            return;
          }

          if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'z') {
            event.preventDefault();
            undoLastChange();
            return;
          }

          if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId) {
            event.preventDefault();
            deleteSelectedSpace();
          }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
      }, [isAdmin, selectedId]);

      const startInteraction = (space, mode, handle, event) => {
        if (!isAdmin || !mapStageRef.current || event.button !== 0) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        pushHistorySnapshot();
        setSelectedId(space.id);
        const rect = mapStageRef.current.getBoundingClientRect();
        dragRef.current = {
          mode,
          handle,
          rect,
          startX: event.clientX,
          startY: event.clientY,
          startSpace: { ...space },
          centerX: rect.left + ((space.x + space.width / 2) / 100) * rect.width,
          centerY: rect.top + ((space.y + space.height / 2) / 100) * rect.height,
          startPointerAngle: Math.atan2(event.clientY - (rect.top + ((space.y + space.height / 2) / 100) * rect.height), event.clientX - (rect.left + ((space.x + space.width / 2) / 100) * rect.width)),
        };

        const handleMove = (moveEvent) => {
          const drag = dragRef.current;
          if (!drag) {
            return;
          }

          const deltaXPercent = ((moveEvent.clientX - drag.startX) / drag.rect.width) * 100;
          const deltaYPercent = ((moveEvent.clientY - drag.startY) / drag.rect.height) * 100;
          const startSpace = drag.startSpace;
          const angleRad = (startSpace.angle || 0) * Math.PI / 180;

          setConfig((current) => {
            const nextSpaces = current.spaces.map((entry, index) => {
              if (entry.id !== startSpace.id) {
                return entry;
              }

              let next = { ...plugin.normalizeSpace(entry, index) };

              if (drag.mode === 'move') {
                next.x = plugin.clamp(startSpace.x + deltaXPercent, 0, 100 - next.width);
                next.y = plugin.clamp(startSpace.y + deltaYPercent, 0, 100 - next.height);
              }

              if (drag.mode === 'resize') {
                const localDx = deltaXPercent * Math.cos(angleRad) + deltaYPercent * Math.sin(angleRad);
                const localDy = -deltaXPercent * Math.sin(angleRad) + deltaYPercent * Math.cos(angleRad);
                const sx = drag.handle.includes('w') ? -1 : 1;
                const sy = drag.handle.includes('n') ? -1 : 1;

                let width = plugin.clamp(startSpace.width + localDx * sx, 0.8, 40);
                let height = plugin.clamp(startSpace.height + localDy * sy, 1.2, 40);
                let x = startSpace.x;
                let y = startSpace.y;

                if (sx < 0) {
                  x = startSpace.x + (startSpace.width - width);
                }
                if (sy < 0) {
                  y = startSpace.y + (startSpace.height - height);
                }

                next.width = width;
                next.height = height;
                next.x = plugin.clamp(x, 0, 100 - width);
                next.y = plugin.clamp(y, 0, 100 - height);
              }

              if (drag.mode === 'rotate') {
                const currentAngle = Math.atan2(moveEvent.clientY - drag.centerY, moveEvent.clientX - drag.centerX);
                next.angle = ((startSpace.angle || 0) + ((currentAngle - drag.startPointerAngle) * 180 / Math.PI));
              }

              next.updatedAt = Date.now();
              return plugin.normalizeSpace(next, index);
            });

            const nextConfig = { ...current, spaces: nextSpaces };
            configRef.current = nextConfig;
            return nextConfig;
          });
        };

        const handleUp = async () => {
          document.removeEventListener('mousemove', handleMove);
          document.removeEventListener('mouseup', handleUp);
          dragRef.current = null;
          await persist(configRef.current);
        };

        document.addEventListener('mousemove', handleMove);
        document.addEventListener('mouseup', handleUp);
      };

      if (loading) {
        return e('div', { className: 'flex h-full items-center justify-center bg-background' },
          e('div', { className: 'text-default-500 text-sm' }, 'Loading parking spaces...')
        );
      }

      if (error) {
        return e('div', { className: 'flex h-full items-center justify-center bg-background p-6' },
          e(Card, { className: 'max-w-xl border border-danger-200 bg-danger-50' },
            e('div', { className: 'p-6' },
              e('h2', { className: 'text-lg font-semibold text-danger' }, 'Parking plugin error'),
              e('p', { className: 'mt-2 text-sm text-danger-700' }, error)
            )
          )
        );
      }

      const renderStat = (label, value, color) => e('div', { className: 'rounded-xl border border-divider bg-background px-4 py-3' },
        e('div', { className: 'text-[11px] uppercase tracking-[0.16em] text-default-500' }, label),
        e('div', { className: `mt-1 text-2xl font-semibold ${color}` }, String(value))
      );

      const editorPanel = isAdmin && e(Card, { className: 'border border-divider bg-content1 shadow-sm' },
        e('div', { className: 'flex h-full flex-col gap-4 p-4' },
          e('div', { className: 'flex items-center justify-between gap-2' },
            e('h2', { className: 'text-base font-semibold' }, 'Selected Space'),
            selectedSpace && e(Badge, { color: selectedSpace.isFull ? 'danger' : 'success', variant: 'flat' }, selectedSpace.isFull ? 'Full' : 'Empty')
          ),
          selectedSpace
            ? e('div', { className: 'flex flex-col gap-3' },
                e('div', { className: 'grid grid-cols-2 gap-3' },
                  e(Input, { label: 'Number', variant: 'bordered', value: selectedSpace.label, onValueChange: (value) => updateSelectedField('label', value) }),
                  e(Input, { label: 'Name', variant: 'bordered', value: selectedSpace.name, onValueChange: (value) => updateSelectedField('name', value) })
                ),
                e(Input, { type: 'number', label: 'Corner Radius', variant: 'bordered', value: String(selectedSpace.radius), onValueChange: (value) => updateSelectedField('radius', value) }),
                e('div', { className: 'rounded-xl border border-divider bg-background p-3 text-sm text-default-500' },
                  'Drag the space to move it. Resize from the corners, rotate from the top handle, use Smart Align for diagonal rows, or use Cmd/Ctrl+C, Cmd/Ctrl+V, Cmd/Ctrl+Z, and Delete.'
                ),
                e('div', { className: 'flex flex-wrap gap-2' },
                  e(Button, { variant: 'flat', onPress: alignSelectedSpace, isDisabled: saving }, 'Smart Align'),
                  e(Button, { color: selectedSpace.isFull ? 'success' : 'danger', variant: 'flat', onPress: toggleSelectedStatus }, selectedSpace.isFull ? 'Mark Empty' : 'Mark Full'),
                  e(Button, { color: 'danger', variant: 'flat', onPress: deleteSelectedSpace }, 'Delete')
                )
              )
            : e('div', { className: 'rounded-xl border border-dashed border-divider p-4 text-sm text-default-500' }, 'Create a space and drag it into place.')
        )
      );

      const listPanel = isAdmin && e(Card, { className: 'border border-divider bg-content1 shadow-sm' },
        e('div', { className: 'flex h-full flex-col gap-3 p-4' },
          e('div', { className: 'flex items-center justify-between gap-2' },
            e('h2', { className: 'text-base font-semibold' }, 'Spaces'),
            e('span', { className: 'text-xs text-default-500' }, `${config.spaces.length} items`)
          ),
          e('div', { className: 'max-h-[260px] overflow-auto' },
            config.spaces.length === 0
              ? e('div', { className: 'rounded-xl border border-dashed border-divider p-4 text-sm text-default-500' }, 'No spaces yet.')
              : e('div', { className: 'flex flex-col gap-2' },
                  config.spaces
                    .slice()
                    .sort((a, b) => String(a.label).localeCompare(String(b.label), undefined, { numeric: true }))
                    .map((space) => e('button', {
                      key: space.id,
                      type: 'button',
                      onClick: () => setSelectedId(space.id),
                      className: `flex items-center justify-between rounded-xl border px-3 py-3 text-left transition ${space.id === selectedId ? 'border-primary bg-primary-50' : 'border-divider bg-background hover:bg-default-50'}`,
                    },
                      e('div', null,
                        e('div', { className: 'font-medium' }, `Space ${space.label}`),
                        e('div', { className: 'text-xs text-default-500' }, space.name)
                      ),
                      e(Badge, { color: space.isFull ? 'danger' : 'success', variant: 'flat' }, space.isFull ? 'Full' : 'Empty')
                    ))
                )
          )
        )
      );

      return e('div', { className: 'flex h-full w-full flex-col gap-4 bg-background p-4 text-foreground overflow-hidden' },
        e(Card, { className: 'shrink-0 border border-divider bg-content1 shadow-sm' },
          e('div', { className: 'flex flex-col gap-4 p-4' },
            e('div', { className: 'flex flex-wrap items-start justify-between gap-4' },
              e('div', { className: 'flex items-start gap-3' },
                assetUrls.map && e('div', { className: 'rounded-xl bg-primary/10 p-3' },
                  e('img', { src: assetUrls.map, alt: '', className: 'h-6 w-6 opacity-80' })
                ),
                e('div', null,
                  e('div', { className: 'text-xs uppercase tracking-[0.18em] text-default-500' }, isAdmin ? 'Editor' : 'Viewer'),
                  e('h1', { className: 'mt-1 text-2xl font-bold' }, 'Parking Spaces'),
                  e('p', { className: 'mt-1 text-sm text-default-500' }, isAdmin ? 'Create a space, drag it, then resize or rotate it directly on the map.' : 'Live parking overview.')
                )
              ),
              e('div', { className: 'grid grid-cols-3 gap-3 min-[620px]:w-auto w-full' },
                renderStat('Total', counts.total, 'text-foreground'),
                renderStat('Empty', counts.available, 'text-success'),
                renderStat('Full', counts.occupied, 'text-danger')
              )
            ),
            e('div', { className: 'flex flex-wrap items-center gap-2' },
              isAdmin && e(Button, { color: 'primary', onPress: () => fileInputRef.current && fileInputRef.current.click(), isDisabled: saving },
                e('span', { className: 'flex items-center gap-2' },
                  assetUrls.upload && e('img', { src: assetUrls.upload, alt: '', className: 'h-4 w-4' }),
                  e('span', null, config.mapFileName ? 'Replace Map' : 'Upload Map')
                )
              ),
              isAdmin && e(Button, { variant: 'flat', onPress: createNewSpace, isDisabled: saving }, 'New Space'),
              selectedSpace && isAdmin && e(Button, { variant: 'flat', color: selectedSpace.isFull ? 'success' : 'danger', onPress: toggleSelectedStatus, isDisabled: saving }, selectedSpace.isFull ? 'Mark Empty' : 'Mark Full'),
              e('input', { ref: fileInputRef, type: 'file', accept: 'image/*', className: 'hidden', onChange: handleMapUpload }),
              e('div', { className: 'ml-auto text-xs text-default-500' }, config.mapMeta && config.mapMeta.originalName ? config.mapMeta.originalName : 'No map uploaded')
            )
          )
        ),
        e('div', { className: `grid min-h-0 flex-1 gap-4 ${isAdmin ? 'xl:grid-cols-[minmax(0,1fr)_280px]' : 'grid-cols-1'}` },
          e(Card, { className: 'min-h-0 border border-divider bg-content1 shadow-sm' },
            e('div', { className: 'flex h-full flex-col p-4' },
              e('div', { className: 'mb-3 flex items-center justify-between gap-2 text-sm text-default-500' },
                e('span', null, isAdmin ? 'Move, resize, and rotate directly on the map.' : 'Current parking layout'),
                selectedSpace && isAdmin && e('span', null, `Selected: ${selectedSpace.label}`)
              ),
              e('div', {
                ref: mapStageRef,
                className: 'relative min-h-0 flex-1 overflow-auto rounded-2xl border border-divider bg-default-100 p-2',
              },
                e('div', { className: `relative w-full ${isAdmin ? 'min-h-[720px]' : 'min-h-[860px]'}` },
                  config.mapUrl
                    ? e('img', { src: config.mapUrl, alt: 'Parking map', className: 'absolute inset-0 h-full w-full object-contain select-none pointer-events-none', draggable: false })
                    : e('div', { className: 'absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-default-500' }, isAdmin ? 'Upload a map image to begin.' : 'Parking map is not available yet.'),
                  config.spaces.map((space) => {
                    const selected = space.id === selectedId;
                    const handleBase = 'absolute h-3 w-3 rounded-full border-2 border-white bg-primary shadow';
                    return e('div', {
                      key: space.id,
                      className: 'absolute',
                      style: {
                        left: `${space.x}%`,
                        top: `${space.y}%`,
                        width: `${space.width}%`,
                        height: `${space.height}%`,
                        transform: `rotate(${space.angle}deg)`,
                        zIndex: selected ? 20 : 10,
                      },
                    },
                      e('button', {
                        type: 'button',
                        'data-space-id': space.id,
                        onClick: (event) => {
                          event.stopPropagation();
                          setSelectedId(space.id);
                        },
                        onMouseDown: (event) => startInteraction(space, 'move', '', event),
                        className: `absolute inset-0 border-2 shadow-lg transition ${selected ? 'ring-2 ring-primary ring-offset-2 ring-offset-content1' : ''} ${space.isFull ? 'bg-danger border-danger-300' : 'bg-success border-success-300'}`,
                        style: { borderRadius: `${space.radius}px`, cursor: isAdmin ? 'grab' : 'pointer' },
                        title: space.name,
                      }),
                      e('div', { className: 'pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 -translate-y-[115%]' },
                        e('div', { className: `rounded-full px-2 py-1 text-[11px] font-bold shadow-sm ${space.isFull ? 'bg-danger text-white' : 'border border-divider bg-content1 text-foreground'}` }, space.label)
                      ),
                      isAdmin && selected && e('div', null,
                        e('button', { type: 'button', className: `${handleBase} -left-1.5 -top-1.5 cursor-nwse-resize`, onMouseDown: (event) => startInteraction(space, 'resize', 'nw', event) }),
                        e('button', { type: 'button', className: `${handleBase} -right-1.5 -top-1.5 cursor-nesw-resize`, onMouseDown: (event) => startInteraction(space, 'resize', 'ne', event) }),
                        e('button', { type: 'button', className: `${handleBase} -left-1.5 -bottom-1.5 cursor-nesw-resize`, onMouseDown: (event) => startInteraction(space, 'resize', 'sw', event) }),
                        e('button', { type: 'button', className: `${handleBase} -right-1.5 -bottom-1.5 cursor-nwse-resize`, onMouseDown: (event) => startInteraction(space, 'resize', 'se', event) }),
                        e('button', { type: 'button', className: 'absolute left-1/2 top-0 h-3.5 w-3.5 -translate-x-1/2 -translate-y-[190%] rounded-full border-2 border-white bg-secondary shadow cursor-grab', onMouseDown: (event) => startInteraction(space, 'rotate', 'rotate', event) })
                      )
                    );
                  })
                )
              )
            )
          ),
          isAdmin && e('div', { className: 'min-h-0 overflow-auto' },
            e('div', { className: 'flex flex-col gap-4 pb-1' },
              editorPanel,
              listPanel
            )
          )
        )
      );
    };

    if (this.container !== container) {
      if (this.root) {
        const oldRoot = this.root;
        setTimeout(() => oldRoot.unmount(), 0);
        this.root = null;
      }
      this.container = container;
      this.root = ReactDOMClient.createRoot(container);
    }

    this.root.render(e(App));
  }

  destroy() {
    if (this.root) {
      this.root.unmount();
      this.root = null;
      this.container = null;
    }
  }
}

window.ParkingSpacesPlugin = ParkingSpacesPlugin;
window.TempTestPlugin = ParkingSpacesPlugin;
window.TempBackgroundPlugin = ParkingSpacesPlugin;

export default ParkingSpacesPlugin;
