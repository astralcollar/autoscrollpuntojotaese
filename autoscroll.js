/**
 * Auto-Advance Script (v9 - Memory & Framing)
 * 
 * Instructions:
 * 1. Refresh Page.
 * 2. Paste and Run.
 * 
 * New Features:
 * - Scroll Memory: Remembers the last video watched when closing PiP.
 * - Cinema Framing: Uses mobile dimensions and CSS to hide clutter in PiP.
 */

(function () {
    console.log("Auto-Advance Script v9 (Polished) Started...");

    // --- State ---
    const attachedVideos = new WeakSet();
    let pipWindow = null;
    let mainContent = null;
    let placeholder = null;
    let restorationChecker = null;
    let lastActiveVideo = null;

    // --- Navigation Logic ---
    function unmuteVideo(video) {
        if (video.muted) video.muted = false;
    }

    function navigateNext(currentVideo) {
        lastActiveVideo = currentVideo; // Valid update even if we don't move yet

        const doc = currentVideo.ownerDocument;
        const win = doc.defaultView;

        const allVideos = Array.from(doc.querySelectorAll('video'));
        const currentIndex = allVideos.indexOf(currentVideo);

        if (currentIndex === -1 || currentIndex === allVideos.length - 1) {
            win.scrollBy({ top: win.innerHeight, behavior: 'smooth' });
            return;
        }

        const nextVideo = allVideos[currentIndex + 1];
        console.log("Navigating to next reel...");
        nextVideo.scrollIntoView({ behavior: 'smooth', block: 'center' });

        unmuteVideo(nextVideo);
        // Force play to ensure it doesn't get stuck on first frame
        try {
            nextVideo.play();
        } catch (e) {
            console.log("Autoplay blocked, user interaction might be needed:", e);
        }
        lastActiveVideo = nextVideo; // Update query
    }

    function attachListener(video) {
        if (attachedVideos.has(video)) return;

        if (video.hasAttribute('loop')) video.removeAttribute('loop');
        video.loop = false;
        unmuteVideo(video);

        video.addEventListener('ended', (e) => {
            e.target.classList.remove('pip-active'); // Un-focus when ended
            navigateNext(e.target);
        });

        // Also update lastActiveVideo on play to track manual scrolls
        video.addEventListener('play', (e) => {
            // Remove focus from all other videos to prevent overlap
            const root = pipWindow ? pipWindow.document : document;
            root.querySelectorAll('video.pip-active').forEach(v => v.classList.remove('pip-active'));

            e.target.classList.add('pip-active'); // Focus current
            lastActiveVideo = e.target;
        });

        attachedVideos.add(video);
    }

    function startObserving(targetDoc) {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach(m => {
                m.addedNodes.forEach(node => {
                    if (node.tagName === 'VIDEO') attachListener(node);
                    else if (node.querySelectorAll) node.querySelectorAll('video').forEach(attachListener);
                });
            });
        });
        observer.observe(targetDoc.body, { childList: true, subtree: true });
        targetDoc.querySelectorAll('video').forEach(attachListener);
        return observer;
    }

    let currentObserver = startObserving(document);

    // Loop & Audio Enforcer
    setInterval(() => {
        const targets = [document];
        if (pipWindow) targets.push(pipWindow.document);

        targets.forEach(doc => {
            doc.querySelectorAll('video').forEach(v => {
                if (v.loop) v.loop = false;
                unmuteVideo(v);
            });
        });

        // Anti-Pause: Ensure active video plays even in background
        if (lastActiveVideo && lastActiveVideo.paused) {
            lastActiveVideo.play().catch(() => { });
        }
    }, 1000);

    // --- Restoration Logic ---
    function restoreContent() {
        if (!mainContent) return;
        console.log("Restoring content & position...");

        if (restorationChecker) {
            clearInterval(restorationChecker);
            restorationChecker = null;
        }

        try {
            document.adoptNode(mainContent);

            if (placeholder && placeholder.parentNode) {
                placeholder.parentNode.insertBefore(mainContent, placeholder);
                placeholder.remove();
            } else {
                document.body.append(mainContent);
            }

            // Critical: Restore Scroll Position
            // Critical: Restore Scroll Position - Robust Retry
            if (lastActiveVideo) {
                const scrollAttempts = [0, 100, 300, 500, 1000];
                scrollAttempts.forEach((delay, index) => {
                    setTimeout(() => {
                        // Ensure it's still in the DOM
                        if (document.body.contains(lastActiveVideo)) {
                            lastActiveVideo.scrollIntoView({ behavior: 'auto', block: 'center' });
                            // Only log on the last attempt to avoid spam, or if it's helpful
                            if (index === scrollAttempts.length - 1) {
                                console.log("Final scroll attempt to last watched video.");
                            }
                        }
                    }, delay);
                });
            }

        } catch (e) {
            console.error("Restoration error:", e);
            document.body.append(mainContent);
        }

        pipWindow = null;
        placeholder = null;

        if (currentObserver) currentObserver.disconnect();
        currentObserver = startObserving(document);
    }

    // --- PiP Logic ---
    async function togglePiP() {
        if (!('documentPictureInPicture' in window)) return;
        if (pipWindow) return;

        try {
            // Use Mobile Aspect Ratio (9:16 approx) to hide sidebars natively
            // 400px width forces most responsive sites to hide comments/sidebars
            pipWindow = await window.documentPictureInPicture.requestWindow({
                width: 250,
                height: 450
            });

            // Copy Styles
            setTimeout(() => {
                [...document.styleSheets].forEach((styleSheet) => {
                    try {
                        const cssRules = [...styleSheet.cssRules].map((rule) => rule.cssText).join('');
                        const style = document.createElement('style');
                        style.textContent = cssRules;
                        pipWindow.document.head.appendChild(style);
                    } catch (e) {
                        const link = document.createElement('link');
                        link.rel = 'stylesheet';
                        link.type = styleSheet.type;
                        link.media = styleSheet.media;
                        link.href = styleSheet.href;
                        pipWindow.document.head.appendChild(link);
                    }
                });

                // --- Framing Fixes: Inject custom CSS for PiP ---
                const framingStyle = document.createElement('style');
                framingStyle.textContent = `
                    /* Lock Body and HTML */
                    html, body {
                        margin: 0 !important;
                        padding: 0 !important;
                        width: 100vw !important;
                        height: 100vh !important;
                        overflow: hidden !important;
                        background: #000 !important;
                        display: flex !important;
                        align-items: center !important;
                        justify-content: center !important;
                    }

                    /* Hide UI Clutter */
                    aside, .sidebar, [role="complementary"],
                    button, [role="button"], [aria-label], 
                    div[class*="Overlay"],
                    a[href*="/"],
                    svg,
                    img[alt],
                    h1, h2, nav 
                    { display: none !important; }

                    /* Active Video State - The one playing */
                    video.pip-active { 
                        position: fixed !important;
                        top: 0 !important;
                        left: 0 !important;
                        width: 100% !important;
                        height: 100% !important;
                        object-fit: contain !important;
                        z-index: 2147483647 !important;
                        display: block !important;
                        opacity: 1 !important;
                        visibility: visible !important;
                        background: #000 !important;
                    }
                `;
                pipWindow.document.head.appendChild(framingStyle);

            }, 0);

            mainContent = document.querySelector('main') || document.body;
            placeholder = document.createComment("pip-placeholder-marker");
            mainContent.parentNode.insertBefore(placeholder, mainContent);

            pipWindow.document.body.append(mainContent);

            // Re-center on the current video immediately in PiP
            const allVideos = Array.from(pipWindow.document.querySelectorAll('video'));
            // Find one that is playing or visible? Use lastKnown
            if (lastActiveVideo) {
                lastActiveVideo.classList.add('pip-active'); // Force active class initially
                lastActiveVideo.scrollIntoView({ block: 'center', behavior: 'instant' });
            } else if (allVideos.length > 0) {
                allVideos[0].classList.add('pip-active');
                allVideos[0].scrollIntoView({ block: 'center', behavior: 'instant' });
            }

            currentObserver.disconnect();
            currentObserver = startObserving(pipWindow.document);

            pipWindow.addEventListener('pagehide', restoreContent);
            restorationChecker = setInterval(() => {
                if (pipWindow && pipWindow.closed) restoreContent();
            }, 500);

        } catch (err) {
            console.error("Auto-PiP Failed:", err);
        }
    }

    togglePiP();

})();
