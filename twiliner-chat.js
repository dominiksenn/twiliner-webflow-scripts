import { createChat } from 'https://cdn.jsdelivr.net/npm/@n8n/chat/dist/chat.bundle.es.js';

createChat({
  webhookUrl:
    'https://n8n.twiliner.com/webhook/0e41443c-aa6c-4e4f-9bc7-1c124082ad9b/chat',

  initialMessages: [
    'Hello, Willkommen, Bonjour, Hola! 👋',
    'How can I help you? Wie kann ich dir helfen? En quoi puis-je vous aider? ¿En qué puedo ayudarte?'
  ],

  i18n: {
    en: {
      title: 'Twiliner assistant',
      subtitle:
        'Helps with questions about routes, availability & traveling with Twiliner.',
      inputPlaceholder: 'Your question...'
    }
  }
});

(() => {
  const MOBILE_BREAKPOINT = 767;
  const CHAT_OPEN_HASH = '#twiliner-chat-open';
  const LEGACY_BREVO_HASH = '#brevoConversationsExpanded';
  const AUTO_OPEN_STORAGE_KEY = 'twiliner_chat_auto_opened_50';

  let savedScrollY = 0;
  let updateScheduled = false;
  let lastKnownOpenState = false;
  let trackedUserMessageCount = 0;
  let pendingChatTrigger = null;

  const isMobile = () =>
    window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;

  const getChatWindow = () =>
    document.querySelector('.n8n-chat .chat-window, .chat-window');

  const getNativeCloseButton = () =>
    document.querySelector('.n8n-chat .chat-close-button, .chat-close-button');

  const getChatToggle = () =>
    document.querySelector('.n8n-chat .chat-window-toggle, .chat-window-toggle');

  function pushChatEvent(eventName, eventParams = {}) {
    window.dataLayer = window.dataLayer || [];

    window.dataLayer.push({
      event: eventName,
      chat_provider: 'n8n',
      chat_widget: 'twiliner_ai_chat',
      page_path: window.location.pathname,
      ...eventParams
    });
  }

  function isElementVisible(element) {
    if (!element) return false;

    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();

    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      Number(style.opacity) !== 0 &&
      rect.width > 0 &&
      rect.height > 0
    );
  }

  function isChatOpen() {
    return isElementVisible(getChatWindow());
  }

  function getOverlay() {
    let overlay = document.querySelector('.twiliner-chat-overlay');

    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'twiliner-chat-overlay';
      overlay.setAttribute('aria-hidden', 'true');

      overlay.addEventListener('click', () => {
        closeChat('overlay_click');
      });

      document.body.appendChild(overlay);
    }

    return overlay;
  }

  function addCloseButton() {
    const chatWindow = getChatWindow();

    if (!chatWindow) return;

    let closeButton = chatWindow.querySelector('.twiliner-chat-close');

    if (closeButton) return;

    closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'twiliner-chat-close';
    closeButton.setAttribute('aria-label', 'Close chat');
    closeButton.setAttribute('title', 'Close chat');

    closeButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeChat('custom_close_button');
    });

    chatWindow.appendChild(closeButton);
  }

  function lockBackground() {
    if (
      document.documentElement.classList.contains('twiliner-chat-is-open')
    ) {
      return;
    }

    savedScrollY = window.scrollY || window.pageYOffset || 0;

    document.documentElement.classList.add('twiliner-chat-is-open');
    document.body.classList.add('twiliner-chat-is-open');

    document.body.style.top = `-${savedScrollY}px`;
  }

  function unlockBackground() {
    const wasLocked = document.documentElement.classList.contains(
      'twiliner-chat-is-open'
    );

    document.documentElement.classList.remove('twiliner-chat-is-open');
    document.body.classList.remove('twiliner-chat-is-open');

    document.body.style.removeProperty('top');

    if (wasLocked) {
      window.scrollTo(0, savedScrollY);
    }
  }

  function openChat(trigger = 'manual') {
    if (isChatOpen()) {
      scheduleUpdate();
      return;
    }

    const toggle = getChatToggle();

    if (toggle) {
      pendingChatTrigger = trigger;
      toggle.click();

      window.setTimeout(updateChatState, 50);
      window.setTimeout(updateChatState, 200);
    }
  }

  function closeChat(trigger = 'manual') {
    if (!isChatOpen()) {
      scheduleUpdate();
      return;
    }

    const nativeCloseButton = getNativeCloseButton();

    pendingChatTrigger = trigger;

    if (nativeCloseButton && isElementVisible(nativeCloseButton)) {
      nativeCloseButton.click();
    } else {
      const toggle = getChatToggle();

      if (toggle) {
        toggle.click();
      }
    }

    window.setTimeout(updateChatState, 50);
    window.setTimeout(updateChatState, 200);
  }

  function handleHashOpen() {
    if (
      window.location.hash === CHAT_OPEN_HASH ||
      window.location.hash === LEGACY_BREVO_HASH
    ) {
      openChat('hash_link');

      if (window.history && window.history.replaceState) {
        window.history.replaceState(
          null,
          document.title,
          window.location.pathname + window.location.search
        );
      }
    }
  }

  function hasReachedHalfPageScroll() {
    const scrollTop = window.scrollY || window.pageYOffset || 0;
    const viewportHeight = window.innerHeight || 0;
    const documentHeight = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight
    );

    if (documentHeight <= viewportHeight) return false;

    const scrollableHeight = documentHeight - viewportHeight;
    const scrollProgress = scrollTop / scrollableHeight;

    return scrollProgress >= 0.5;
  }

  function hasAutoOpenAlreadyHappened() {
    try {
      return localStorage.getItem(AUTO_OPEN_STORAGE_KEY) === 'true';
    } catch (error) {
      return false;
    }
  }

  function markAutoOpenAsDone() {
    try {
      localStorage.setItem(AUTO_OPEN_STORAGE_KEY, 'true');
    } catch (error) {
      /* localStorage kann in einzelnen Browser-/Privacy-Modi blockiert sein. */
    }
  }

  function maybeAutoOpenAtHalfScroll() {
    if (hasAutoOpenAlreadyHappened()) return;
    if (isChatOpen()) return;
    if (!hasReachedHalfPageScroll()) return;

    markAutoOpenAsDone();

    pushChatEvent('twiliner_chat_auto_open_50', {
      chat_trigger: 'scroll_50_percent'
    });

    openChat('scroll_50_percent');
  }

  function trackUserMessages() {
    const userMessages = document.querySelectorAll(
      '.n8n-chat .chat-message-from-user, .chat-message-from-user'
    );

    const currentCount = userMessages.length;

    if (currentCount > trackedUserMessageCount) {
      const newMessages = currentCount - trackedUserMessageCount;

      for (let i = 0; i < newMessages; i += 1) {
        pushChatEvent('twiliner_chat_message_sent', {
          chat_message_count: trackedUserMessageCount + i + 1
        });
      }

      trackedUserMessageCount = currentCount;
    }
  }

  function updateChatState() {
    updateScheduled = false;

    const open = isChatOpen();
    const overlay = getOverlay();

    addCloseButton();
    trackUserMessages();

    if (isMobile() && open) {
      overlay.classList.add('is-active');
      overlay.setAttribute('aria-hidden', 'false');

      lockBackground();
    } else {
      overlay.classList.remove('is-active');
      overlay.setAttribute('aria-hidden', 'true');

      unlockBackground();
    }

    if (open !== lastKnownOpenState) {
      if (open) {
        pushChatEvent('twiliner_chat_open', {
          chat_trigger: pendingChatTrigger || 'native_toggle_or_widget'
        });
      } else {
        pushChatEvent('twiliner_chat_close', {
          chat_trigger: pendingChatTrigger || 'native_toggle_or_widget'
        });
      }

      lastKnownOpenState = open;
      pendingChatTrigger = null;
    }
  }

  function scheduleUpdate() {
    if (updateScheduled) return;

    updateScheduled = true;

    window.requestAnimationFrame(updateChatState);
  }

  const observer = new MutationObserver(scheduleUpdate);

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'hidden', 'aria-hidden']
  });

  document.addEventListener(
    'click',
    (event) => {
      const chatOpenLink = event.target.closest(
        `a[href="${CHAT_OPEN_HASH}"], a[href="${LEGACY_BREVO_HASH}"]`
      );

      if (chatOpenLink) {
        event.preventDefault();
        openChat('text_link');
        return;
      }

      if (
        event.target.closest('.chat-window-toggle') ||
        event.target.closest('.chat-close-button')
      ) {
        window.setTimeout(scheduleUpdate, 50);
        window.setTimeout(scheduleUpdate, 200);
      }
    },
    true
  );

  window.addEventListener('hashchange', handleHashOpen);

  window.addEventListener('scroll', maybeAutoOpenAtHalfScroll, {
    passive: true
  });

  window.addEventListener('resize', () => {
    scheduleUpdate();
    maybeAutoOpenAtHalfScroll();
  });

  window.addEventListener('orientationchange', () => {
    window.setTimeout(scheduleUpdate, 150);
    window.setTimeout(maybeAutoOpenAtHalfScroll, 150);
  });

  const mobileMediaQuery = window.matchMedia(
    `(max-width: ${MOBILE_BREAKPOINT}px)`
  );

  if (typeof mobileMediaQuery.addEventListener === 'function') {
    mobileMediaQuery.addEventListener('change', scheduleUpdate);
  } else if (typeof mobileMediaQuery.addListener === 'function') {
    mobileMediaQuery.addListener(scheduleUpdate);
  }

  handleHashOpen();
  scheduleUpdate();
  maybeAutoOpenAtHalfScroll();
})();
