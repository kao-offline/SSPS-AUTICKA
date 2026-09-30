/**
 * Camera Management Plugin v2.0
 * Multi-screen camera manager using HeroUI and React
 * (Refactored to avoid JSX and fix React root/key issues)
 */

class CameraManagementPlugin {
  constructor() {
    this.sdk = null;
    this.context = null;
    this.root = null;
    this.container = null;
  }

  async initialize(context) {
    this.sdk = window.PluginSDK;
    this.context = context;
    if (this.sdk) {
      this.sdk.log('Camera Management Plugin v2.0 initializing...');
    }
  }

  createUI(container) {
    const runtime = window.PluginRuntime || (window.parent && window.parent.PluginRuntime);
    if (!runtime) {
      container.innerHTML = '<div style="padding: 20px; color: red;">Error: PluginRuntime not available.</div>';
      return;
    }

    const { React, ReactDOMClient, HeroUI } = runtime;
    if (!React || !ReactDOMClient || !HeroUI) {
      container.innerHTML = '<div style="padding: 20px; color: red;">Error: React/HeroUI components not available in runtime.</div>';
      return;
    }

    const { createElement: e, Fragment } = React;
    const {
      Button, Card, Input, Modal, ModalContent, ModalHeader,
      ModalBody, ModalFooter, useDisclosure, Badge
    } = HeroUI;

    const App = () => {
      const [cameras, setCameras] = React.useState([]);
      const [pendingFeeds, setPendingFeeds] = React.useState([]);
      const [lastFrameByCameraId, setLastFrameByCameraId] = React.useState({});
      const [nowMs, setNowMs] = React.useState(Date.now());
      const [isAdmin, setIsAdmin] = React.useState(false);
      const [loading, setLoading] = React.useState(true);
      const [maximizedCamera, setMaximizedCamera] = React.useState(null);
      const { isOpen, onOpen, onOpenChange } = useDisclosure();
      const [newCam, setNewCam] = React.useState({ name: '', url: '', type: 'auto' });
      const [renderErr, setRenderErr] = React.useState(null);
      const [assetUrls, setAssetUrls] = React.useState({});

      React.useEffect(() => {
        let isMounted = true;
        const load = async () => {
          try {
            const userData = this.context?.userData || (this.sdk ? await this.sdk.getCurrentUser() : null);
            if (isMounted) {
              setIsAdmin(userData?.role === 'admin');
            }

            if (this.sdk) {
              const saved = await this.sdk.getData('cameras');
              if (isMounted && Array.isArray(saved)) {
                setCameras(saved);
              }

              const pending = await this.sdk.getData('externalFeedRequests');
              if (isMounted && Array.isArray(pending)) {
                setPendingFeeds(pending);
              }
            }
          } catch (err) {
            if (this.sdk) this.sdk.error('Failed to load plugin data', err);
          } finally {
            if (isMounted) setLoading(false);
          }
        };
        load();
        return () => { isMounted = false; };
      }, []);

      React.useEffect(() => {
        if (!this.sdk) return;

        // Ensure externalFeedRequests data key exists and is an array
        const initPendingData = async () => {
          try {
            const existing = await this.sdk.getData('externalFeedRequests');
            if (!Array.isArray(existing)) {
              await this.sdk.setData('externalFeedRequests', []);
            }
          } catch {
            // ignore init failures
          }
        };
        initPendingData();

        const interval = setInterval(async () => {
          try {
            const pending = await this.sdk.getData('externalFeedRequests');
            if (Array.isArray(pending)) {
              setPendingFeeds(pending);
            }
            setNowMs(Date.now());
          } catch {
            // ignore polling failures
          }
        }, 2000);

        return () => clearInterval(interval);
      }, [this.sdk]);

      React.useEffect(() => {
        let isMounted = true;
        const loadAssets = async () => {
          if (!this.sdk) return;
          const search = await this.sdk.getAssetUrl('search.svg');
          const trash = await this.sdk.getAssetUrl('trash.svg');
          const warning = await this.sdk.getAssetUrl('warning.svg');
          const camera = await this.sdk.getAssetUrl('camera-solid.svg');
          if (isMounted) setAssetUrls({ search, trash, warning, camera });
        };

        loadAssets().catch((err) => {
          if (this.sdk) this.sdk.error('Failed to load camera plugin assets', err);
        });

        return () => { isMounted = false; };
      }, []);

        const detectType = (url) => {
          if (!url) return 'unknown';
          const lower = url.toLowerCase();
          if (lower.includes('.mjpeg') || lower.includes('.mjpg')) return 'mjpeg';
          if (lower.match(/\.(jpg|jpeg|png)(\?.*)?$/)) return 'snapshot';
          if (lower.startsWith('rtsp://')) return 'rtsp';
          return 'http-stream';
        };

        const CameraFeed = React.useMemo(() => function CameraFeed({ camera, isMaximized = false, assetUrls, isAdmin, nowMs, lastFrameByCameraId, setLastFrameByCameraId, setMaximizedCamera, deleteCamera, sdk }) {
          const [frame, setFrame] = React.useState(null);
          const lastExternalFrameAtRef = React.useRef(0); // Ref to avoid closure bugs
          const type = camera.type === 'auto' ? detectType(camera.url) : camera.type;
          const isSecure = window.location.protocol === 'https:';
          const isUrlInsecure = camera.url.startsWith('http:');
          const showMixedContentWarning = isSecure && isUrlInsecure && (type === 'mjpeg' || type === 'snapshot');

          React.useEffect(() => {
            let cleanup = () => {};

            // Always listen for externally pushed frames. This makes API testing visible
            // even when camera type is not explicitly RTSP/proxied.
            if (sdk) {
              const streamId = camera.streamId || camera.id;
              cleanup = sdk.onStreamFrame(streamId, (data) => {
                setFrame(data);
                const ts = Date.now();
                lastExternalFrameAtRef.current = ts; // Update ref immediately
                setLastFrameByCameraId((prev) => ({ ...prev, [camera.id]: ts }));
              });
            }

            if (type === 'snapshot') {
              const interval = setInterval(() => {
                // Use ref instead of state to get latest value in closure
                if (Date.now() - lastExternalFrameAtRef.current < 10000) {
                  return;
                }
                setFrame(`${camera.url}${camera.url.includes('?') ? '&' : '?'}_t=${Date.now()}`);
              }, 2000);

              const prevCleanup = cleanup;
              cleanup = () => {
                prevCleanup();
                clearInterval(interval);
              };
            }

            return cleanup;
          }, [camera.id, camera.streamId, type, camera.url, sdk, setLastFrameByCameraId]);

          const renderContent = () => {
            // If an injected frame exists, always display it first.
            if (frame && typeof frame === 'string') {
              return e('img', { src: frame, className: 'w-full h-full object-contain bg-black', alt: camera.name });
            }

            if (showMixedContentWarning) {
              return e('div', { className: 'flex flex-col items-center justify-center h-full p-4 text-center bg-gray-900 text-white' },
                assetUrls.warning ? e('img', { src: assetUrls.warning, className: 'w-10 h-10 mb-2 invert' }) : e('span', { className: 'text-4xl mb-2' }, '??????'),
                e('p', { className: 'text-sm font-semibold' }, 'Insecure Stream Blocked'),
                e('p', { className: 'text-xs mt-1 text-gray-400' }, 'Mixed content (HTTP on HTTPS) is blocked by your browser.'),
                e(Button, {
                  size: 'sm', color: 'warning', variant: 'flat', className: 'mt-2',
                  onClick: () => window.open(camera.url, '_blank')
                }, 'Open in New Tab')
              );
            }

            if (type === 'rtsp' || type === 'proxied') {
              return frame
                ? e('img', { src: frame, className: 'w-full h-full object-contain bg-black', alt: camera.name })
                : e('div', { className: 'flex flex-col items-center justify-center h-full bg-gray-900 text-gray-500' },
                    e('span', { className: 'animate-pulse text-2xl' }, '????'),
                    e('span', { className: 'text-xs mt-2' }, 'Waiting for proxy frames...')
                  );
            }

            if (type === 'mjpeg' || type === 'http-stream') {
              return e('img', {
                src: camera.url, className: 'w-full h-full object-contain bg-black', alt: camera.name,
                onError: (event) => {
                  event.target.style.display = 'none';
                  if (event.target.nextSibling) event.target.nextSibling.style.display = 'flex';
                }
              });
            }

            if (type === 'snapshot') {
              return e('img', {
                src: frame || camera.url, className: 'w-full h-full object-contain bg-black', alt: camera.name
              });
            }

            return e('div', { className: 'flex flex-col items-center justify-center h-full bg-gray-900 text-gray-400' },
              e('span', { className: 'text-2xl' }, '???'),
              e('span', { className: 'text-xs mt-1' }, 'Unknown Stream Type')
            );
          };

          return e('div', { className: 'relative w-full h-full group overflow-hidden bg-black rounded-xl' },
            renderContent(),
            e('div', {
              className: 'flex flex-col items-center justify-center h-full bg-gray-900 text-gray-500 absolute inset-0',
              style: { display: 'none' }
            },
              e('span', { className: 'text-2xl' }, '???'),
              e('span', { className: 'text-xs mt-1' }, 'Stream Error')
            ),
            e('div', { className: 'absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex justify-between items-end' },
              e('div', null,
                e('p', { className: 'text-white text-sm font-medium' }, camera.name),
                e(Badge, { size: 'sm', color: type === 'rtsp' ? 'primary' : 'success', variant: 'flat', className: 'text-[10px] uppercase' }, type)
              ),
              (camera.external || type === 'proxied') && e('div', { className: 'absolute top-3 left-3' },
                e(Badge, {
                  size: 'sm',
                  color: (nowMs - (lastFrameByCameraId[camera.id] || 0) < 5000) ? 'success' : 'danger',
                  variant: 'solid',
                  className: 'text-[10px] uppercase'
                }, (nowMs - (lastFrameByCameraId[camera.id] || 0) < 5000) ? 'online' : 'offline')
              ),
              e('div', { className: 'flex gap-1' },
                !isMaximized && e(Button, {
                  size: 'sm', isIconOnly: true, variant: 'flat', className: 'bg-white/20 text-white',
                  onClick: () => setMaximizedCamera(camera)
                }, assetUrls.search ? e('img', { src: assetUrls.search, className: 'w-4 h-4 invert' }) : '????'),
                isAdmin && e(Button, {
                  size: 'sm', isIconOnly: true, color: 'danger', variant: 'flat',
                  onClick: (evt) => { evt.stopPropagation(); deleteCamera(camera.id); }
                }, assetUrls.trash ? e('img', { src: assetUrls.trash, className: 'w-4 h-4 invert' }) : '???????')
              )
            )
          );
        }, []);


      if (renderErr) {
        return e('div', { className: 'p-10 text-red-500 font-mono text-sm' },
          e('h2', { className: 'font-bold text-lg mb-2' }, 'Plugin Render Error'),
          e('pre', { className: 'bg-red-50 p-4 rounded border border-red-200 overflow-auto' }, renderErr.stack || renderErr.message)
        );
      }

      try {
        const saveCameras = async (updated) => {
          setCameras(updated);
          if (this.sdk) await this.sdk.setData('cameras', updated);
        };

        const addCamera = () => {
          if (!newCam.name || !newCam.url) return;
          const updated = [...cameras, { ...newCam, id: Date.now().toString() }];
          saveCameras(updated);
          setNewCam({ name: '', url: '', type: 'auto' });
          onOpenChange(false);
        };

        const deleteCamera = (id) => {
          if (confirm('Delete this camera?')) {
            saveCameras(cameras.filter(c => c.id !== id));
          }
        };

        const savePendingFeeds = async (updated) => {
          setPendingFeeds(updated);
          if (this.sdk) await this.sdk.setData('externalFeedRequests', updated);
        };

        const approveFeedRequest = async (requestId) => {
          const request = pendingFeeds.find((item) => item.id === requestId);
          if (!request) return;

          const exists = cameras.some((cam) => {
            const sameStream = cam.streamId && request.streamId && cam.streamId === request.streamId;
            const sameName = (cam.name || '').trim().toLowerCase() === (request.name || '').trim().toLowerCase();
            return sameStream || sameName;
          });

          if (!exists) {
            const approvedCam = {
              id: `ext_${Date.now()}`,
              name: request.name,
              url: '',
              type: 'proxied',
              streamId: request.streamId,
              external: true,
              approvedAt: Date.now(),
            };
            console.log('[CameraPlugin] Approving feed:', request.name, '→ Camera ID:', approvedCam.id, 'Stream ID:', approvedCam.streamId);
            await saveCameras([...cameras, approvedCam]);
          }

          await savePendingFeeds(pendingFeeds.filter((item) => item.id !== requestId));
        };

        const rejectFeedRequest = async (requestId) => {
          await savePendingFeeds(pendingFeeds.filter((item) => item.id !== requestId));
        };

        const getGridCols = () => {
          const count = cameras.length;
          if (count === 0) return 'grid-cols-1';
          if (count === 1) return 'grid-cols-1';
          if (count === 2) return 'grid-cols-1 md:grid-cols-2';
          if (count === 3 || count === 4) return 'grid-cols-1 md:grid-cols-2';
          if (count > 4 && count <= 6) return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';
          return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
        };

        return e('div', { className: 'flex flex-col h-full w-full bg-background overflow-hidden p-6 gap-6 font-sans' },
          e('div', { className: 'flex justify-between items-center shrink-0' },
            e('div', { className: 'flex items-center gap-3' },
              e('div', { className: 'bg-primary/10 p-3 rounded-xl' },
                assetUrls.camera
                  ? e('img', { src: assetUrls.camera, className: 'w-6 h-6 text-primary', onError: (evt) => { evt.target.style.display = 'none'; } })
                  : e('span', { className: 'text-lg' }, '📷')
              ),
              e('div', null,
                e('h1', { className: 'text-2xl font-bold' }, 'Camera Manager'),
                e('p', { className: 'text-default-500 text-sm' }, 'Monitor multiple secure and unsecure feeds')
              )
            ),
            isAdmin && e(Button, { color: 'primary', onPress: onOpen }, 'Add Camera')
          ),
          isAdmin && pendingFeeds.length > 0 && e('div', { className: 'shrink-0 bg-warning-50 border border-warning-200 rounded-xl p-4' },
            e('div', { className: 'flex items-center justify-between mb-3' },
              e('h3', { className: 'font-semibold text-warning-700' }, `Pending feed requests (${pendingFeeds.length})`),
              e('span', { className: 'text-xs text-warning-600' }, 'Manual approval required')
            ),
            e('div', { className: 'flex flex-col gap-2 max-h-44 overflow-auto' },
              pendingFeeds.map((req) =>
                e('div', {
                  key: req.id,
                  className: 'flex items-center justify-between bg-white rounded-lg border border-warning-200 p-2'
                },
                  e('div', null,
                    e('p', { className: 'text-sm font-medium' }, req.name),
                    e('p', { className: 'text-xs text-default-500 font-mono' }, `stream: ${req.streamId}`)
                  ),
                  e('div', { className: 'flex gap-2' },
                    e(Button, { size: 'sm', color: 'success', variant: 'flat', onPress: () => approveFeedRequest(req.id) }, 'Approve'),
                    e(Button, { size: 'sm', color: 'danger', variant: 'flat', onPress: () => rejectFeedRequest(req.id) }, 'Reject')
                  )
                )
              )
            )
          ),
          e('div', { className: 'flex-1 overflow-auto bg-content1 rounded-2xl border border-divider shadow-sm' },
            loading
              ? e('div', { className: 'flex items-center justify-center h-full' }, e('span', { className: 'animate-spin text-4xl' }, '⚙️'))
              : cameras.length === 0
                ? e('div', { className: 'flex flex-col items-center justify-center h-full text-default-400 gap-2' },
                    e('span', { className: 'text-6xl text-default-200' }, '📹'),
                    e('p', null, 'No cameras added yet'),
                    isAdmin && e(Button, { size: 'sm', variant: 'flat', onPress: onOpen }, 'Click to add your first camera')
                  )
                : e('div', { className: `grid gap-4 p-4 h-full ${getGridCols()}` },
                    cameras.map(cam => e(Card, { key: cam.id, className: 'w-full h-full relative overflow-hidden group border-none min-h-[200px]', shadow: 'sm' },
                      e(CameraFeed, { camera: cam, assetUrls, isAdmin, nowMs, lastFrameByCameraId, setLastFrameByCameraId, setMaximizedCamera, deleteCamera, sdk: this.sdk })
                    ))
                  )
          ),
          e(Modal, { isOpen, onOpenChange, placement: 'top-center' },
            e(ModalContent, null, (onClose) => e(Fragment, null, [
              e(ModalHeader, { key: 'h', className: 'flex flex-col gap-1' }, 'Add New Camera'),
              e(ModalBody, { key: 'b' }, [
                e(Input, {
                  key: 'i1',
                  autoFocus: true,
                  label: 'Camera Name',
                  placeholder: 'Enter camera name',
                  variant: 'bordered',
                  value: newCam.name,
                  onValueChange: (val) => setNewCam({ ...newCam, name: val })
                }),
                e(Input, {
                  key: 'i2',
                  label: 'Stream URL',
                  placeholder: 'http://... or rtsp://...',
                  variant: 'bordered',
                  value: newCam.url,
                  onValueChange: (val) => {
                    const type = val.startsWith('rtsp://') ? 'rtsp' : 'auto';
                    setNewCam({ ...newCam, url: val, type });
                  }
                }),
                e('div', { key: 'd1', className: 'flex gap-2 items-center text-xs text-default-500' },
                  e('span', { className: 'flex items-center' }, '💡'),
                  e('span', null, 'RTSP streams require a proxy server sending frames via SDK.')
                )
              ]),
              e(ModalFooter, { key: 'f' }, [
                e(Button, { key: 'cancel', color: 'danger', variant: 'flat', onPress: onClose }, 'Cancel'),
                e(Button, { key: 'save', color: 'primary', onPress: addCamera }, 'Add Camera')
              ])
            ]))
          ),
          maximizedCamera && e('div', { className: 'fixed inset-0 z-[1000] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 md:p-10' },
            e(Button, {
              isIconOnly: true, variant: 'flat', className: 'absolute top-6 right-6 bg-white/10 text-white hover:bg-white/20 z-[1001]',
              onClick: () => setMaximizedCamera(null)
            }, '✕'),
            e('div', { className: 'w-full h-full max-w-6xl aspect-video relative rounded-2xl overflow-hidden shadow-2xl border border-white/10' },
              e(CameraFeed, { camera: maximizedCamera, isMaximized: true, assetUrls, isAdmin, nowMs, lastFrameByCameraId, setLastFrameByCameraId, setMaximizedCamera, deleteCamera, sdk: this.sdk })
            )
          ),
          e('style', { dangerouslySetInnerHTML: { __html: `
            @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
            .animate-spin { animation: spin 2s linear infinite; }
            .animate-pulse { animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
          `}})
        );
      } catch (e) {
        setRenderErr(e);
        return null;
      }
    };

    if (this.container !== container) {
      if (this.root) {
        // Use a small timeout to avoid "synchronously unmount" warning if called during render
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

window.CameraManagementPlugin = CameraManagementPlugin;
window.TempTestPlugin = CameraManagementPlugin;

export default CameraManagementPlugin;
