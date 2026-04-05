(function () {
  'use strict';

  const PLATFORM = location.hostname.includes('instagram')
    ? 'instagram'
    : location.hostname.includes('facebook')
    ? 'facebook'
    : 'unknown';

  if (PLATFORM === 'unknown') return;

  console.log(`[AID] Content script active on ${PLATFORM}`);

  const processedPosts = new Set();
  const inFlightPosts = new Set();
  const resultCache = new Map();

  let scanningEnabled = true;
  let debounceTimer = null;
  let idCounter = 0;

  chrome.storage.sync.get({ enabled: true }, ({ enabled }) => {
    scanningEnabled = enabled;
    if (scanningEnabled) scheduleScan();
  });

  chrome.storage.onChanged.addListener((changes) => {
    if ('enabled' in changes) {
      scanningEnabled = changes.enabled.newValue;
      if (scanningEnabled) scheduleScan();
    }
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (!message || !message.type) return;

    if (message.type === 'ANALYSIS_RESULT') {
      const { postId, result } = message;
      inFlightPosts.delete(postId);
      resultCache.set(postId, result);

      const imgEl = document.querySelector(`[data-aid-id="${postId}"]`);
      if (imgEl) applyResult(imgEl, result);
    }

    if (message.type === 'ANALYSIS_ERROR') {
      const postId = message.postId;
      inFlightPosts.delete(postId);

      const imgEl = document.querySelector(`[data-aid-id="${postId}"]`);
      if (imgEl) {
        showBadge(imgEl, 'error');
        processedPosts.delete(postId);
      }
    }
  });

  function getOrCreateImageId(el) {
    if (!el.dataset.aidId) {
      el.dataset.aidId = `aid-img-${Date.now()}-${idCounter++}`;
    }
    return el.dataset.aidId;
  }

  function cleanText(text) {
    return (text || '').replace(/\s+/g, ' ').trim();
  }

  // ── Exclusion helpers ──────────────────────────────────────────────────────

  /**
   * Containers that are never real feed posts on either platform.
   * Matching any of these means the image should be skipped.
   */
  const EXCLUDED_CONTAINERS = [
    // Facebook structural pagelets
    '[data-pagelet="RightRail"]',
    '[data-pagelet*="Sidebar"]',
    '[data-pagelet*="Stories"]',
    '[data-pagelet*="ProfileCover"]',
    '[data-pagelet*="ProfileActions"]',
    '[data-pagelet*="PeopleYouMayKnow"]',
    '[data-pagelet*="FriendSuggestions"]',
    '[data-pagelet*="GroupSuggestions"]',
    '[data-pagelet*="PageSuggestions"]',
    '[data-pagelet*="MeetyouMayKnow"]',
    '[data-pagelet*="Marketplace"]',
    '[data-pagelet*="EventsPlanningTool"]',
    // Facebook UI chrome
    '[role="banner"]',
    'nav',
    'footer',
    // Instagram
    '[aria-label*="torie"]',
    '[aria-label*="Story"]',
    '[aria-label*="Highlights"]',
    'section > div > header',        // IG story bar header
  ];

  /** True if the element is inside any container we never want to scan */
  function isInsideExcludedContainer(el) {
    return EXCLUDED_CONTAINERS.some(sel => el.closest(sel));
  }

  /** True if the post article contains a Facebook "Sponsored" marker */
  function isFacebookSponsored(article) {
    // Only trust unambiguous markers injected by Facebook's own ad renderer.
    // We check for aria-label="Sponsored" (and common localizations).
    // Note: Do NOT check for [data-ad-comet-preview] or [data-ad-rendering-role]
    // because Facebook sometimes applies these to normal organic posts as well.
    return !!article.querySelector(
      '[aria-label="Sponsored"], [aria-label="Publicité"], [aria-label="Patrocinado"], [aria-label="Gesponsert"]'
    );
  }


  /** True if the post article contains an Instagram "Sponsored" marker */
  function isInstagramSponsored(article) {
    // Instagram uses a span with the exact word
    const spans = Array.from(article.querySelectorAll('span, a'));
    for (const s of spans) {
      if (s.children.length === 0 && /^Sponsored$|^Publicité$|^Publicado$/.test((s.textContent || '').trim())) return true;
    }
    return false;
  }

  /** True if this image looks like a profile picture / avatar */
  function isAvatarImage(img) {
    const alt = (img.alt || '').toLowerCase();
    const src = (img.src || '').toLowerCase();

    if (alt.includes('profile') || alt.includes('avatar') || alt.includes('photo de profil')) return true;
    if (alt.includes('user') && (alt.includes('icon') || alt.includes('image'))) return true;

    // Facebook profile pics have a predictable CDN path pattern
    if (src.includes('profile_pic') || src.includes('profile-picture')) return true;
    // Instagram avatars use /s150x150/ or /s32x32/ segments in the URL
    if (/\/s\d{2,3}x\d{2,3}\//.test(img.src) && getImageArea(img) < 15000) return true;

    return false;
  }

  /** True if this is a reaction emoji, sticker, or icon */
  function isReactionOrIcon(img) {
    const alt = (img.alt || '').toLowerCase();
    const rect = img.getBoundingClientRect();
    const w = rect.width || img.clientWidth || 0;
    const h = rect.height || img.clientHeight || 0;

    if (alt.includes('reaction') || alt.includes('emoji') || alt.includes('sticker')) return true;
    // Reactions/icons are always tiny
    if (w > 0 && h > 0 && w <= 48 && h <= 48) return true;
    // Inside a reaction button row
    if (img.closest('[aria-label*="React"], [aria-label*="Like"], [aria-label*="reaction"]')) return true;
    return false;
  }

  /** True if this image belongs to a "People you may know" friend-card widget.
   * NOTE: "Suggested Posts" inside the feed are real posts — we WANT to scan those.
   * Only block the compact friend/follow suggestion card rows.
   */
  function isProfileSuggestion(img) {
    // Only match unambiguous friend-suggestion card containers
    return !!img.closest(
      '[aria-label*="People you may know"],' +
      '[aria-label*="Friend Request"],' +
      '[aria-label*="Add Friend"],' +
      '[data-testid="pymy-card"],' +
      '[data-testid*="friend-suggestion"]'
    );
  }

  /** True if this is a story thumbnail (circular, in a story bar) */
  function isStoryThumbnail(img) {
    if (isInsideExcludedContainer(img)) return true;
    // On Instagram, stories are in the top header area before the feed
    if (PLATFORM === 'instagram') {
      // Stories bar is the first <ul> inside the main section
      if (img.closest('ul') && !img.closest('article')) return true;
      // Canvas-based story previews
      if (img.closest('canvas')) return true;
    }
    return false;
  }

  function getImageArea(img) {
    // FB uses giant sprite sheets for reactions but displays them tiny.
    // Using getBoundingClientRect ensures we check the actual on-screen size.
    const rect = img.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      return rect.width * rect.height;
    }
    return (img.clientWidth || 0) * (img.clientHeight || 0);
  }

  // isTinyOrAvatar kept as a thin alias so nothing else breaks
  function isTinyOrAvatar(img) {
    return shouldSkipImage ? shouldSkipImage(img) : false;
  }

  /**
   * Fast combined check — returns true if we should SKIP this image.
   * Called once per image before any DOM walking.
   */
  function shouldSkipImage(img) {
    if (!img.src) return true;

    const rect = img.getBoundingClientRect();
    const w = rect.width || img.clientWidth || 0;
    const h = rect.height || img.clientHeight || 0;

    // Too small to be real post content
    if (w > 0 && h > 0 && w <= 120 && h <= 120) return true;
    if (getImageArea(img) <= 20000) return true;

    // Quick structural exclusions (cheap, no DOM walk)
    if (isReactionOrIcon(img)) return true;
    if (isAvatarImage(img)) return true;
    if (isStoryThumbnail(img)) return true;
    if (isInsideExcludedContainer(img)) return true;
    if (isProfileSuggestion(img)) return true;

    return false;
  }

  /**
   * Find the nearest enclosing post article for img, then decide if the
   * whole post is a real organic post worth scanning.
   */
  function getCandidatePairs() {
    const imgs = Array.from(document.querySelectorAll('img')).filter(
      (img) => !shouldSkipImage(img)
    );

    const pairs = [];

    for (const img of imgs) {
      // Walk up to find post article container
      let container = img.parentElement;
      let depth = 0;
      let found = false;

      while (container && depth < 25) {
        if (
          container.matches('article') ||
          container.matches('div[role="article"]') ||
          container.matches('div[data-pagelet*="FeedUnit"]') ||
          container.matches('div[aria-posinset]') ||
          container.matches('[role="dialog"]')
        ) {
          found = true;
          break;
        }

        container = container.parentElement;
        depth++;
      }

      if (!found || !container) continue;

      // ── Post-level exclusions (check the whole article) ────────────────────

      // Skip Facebook posts with no timestamp — but only enforce this if
      // a <time> element is definitively absent (modern FB may render links
      // without story_fbid/permalink, so we just check for <time>).
      // Disabled: too many false negatives on dynamically-loaded posts.
      // if (!hasTimestamp && PLATFORM === 'facebook') continue;

      // Skip Facebook sponsored posts
      if (PLATFORM === 'facebook' && isFacebookSponsored(container)) continue;

      // Skip Instagram sponsored posts
      if (PLATFORM === 'instagram' && isInstagramSponsored(container)) continue;

      // Skip Facebook right-rail / sidebar articles
      if (container.closest('[data-pagelet="RightRail"], [data-pagelet*="Sidebar"]')) continue;

      // On Instagram, skip posts that are clearly not in the main feed
      // (Explore grid, Reels tab). We check the closest <main> exists,
      // OR we are inside a clicked modal dialog.
      if (PLATFORM === 'instagram') {
        if (!container.closest('main') && !container.closest('[role="dialog"]')) continue;
      }

      pairs.push({ container, image: img });
    }

    return pairs;
  }

  function extractPostData(container, imgEl) {
    const imageUrl = imgEl.currentSrc || imgEl.src;
    if (!imageUrl) return null;

    const postId = getOrCreateImageId(imgEl);

    return {
      postId,
      platform: PLATFORM,
      pageUrl: location.href,
      imageUrl,
      container,
      imgEl,
    };
  }

  async function fetchImageAsBase64(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        mode: 'cors',
        cache: 'force-cache'
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const blob = await res.blob();

      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (err) {
      console.warn('[AID] fetch failed:', err.message);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function processPair(pair) {
    const container = pair.container;
    const imgEl = pair.image;
    const postId = getOrCreateImageId(imgEl);

    if (processedPosts.has(postId) || inFlightPosts.has(postId)) return;

    const postData = extractPostData(container, imgEl);
    if (!postData) return;

    processedPosts.add(postId);
    inFlightPosts.add(postId);

    showBadge(imgEl, 'scanning');

    const base64 = await fetchImageAsBase64(postData.imageUrl);

    if (!base64) {
      showBadge(imgEl, 'error');
      processedPosts.delete(postId);
      inFlightPosts.delete(postId);
      return;
    }

    chrome.runtime.sendMessage({
      type: 'ANALYZE_POST',
      data: {
        postId,
        base64DataUri: base64,
        platform: postData.platform,
        pageUrl: postData.pageUrl
      }
    });
  }

  async function scanVisible() {
    if (!scanningEnabled) return;

    const pairs = getCandidatePairs();

    for (const pair of pairs) {
      processPair(pair).catch(console.error);
    }
  }

  function applyResult(imgEl, result) {
    if (result.blocked) {
      applyBlockOverlay(imgEl, result);
    } else {
      removeBlockOverlay(imgEl);
      if (result.status === 'heuristic_only') {
        showBadge(imgEl, 'heuristic', result);
      } else {
        showBadge(imgEl, 'verified', result);
      }
    }
  }

  function applyBlockOverlay(imgEl, result) {
    imgEl.classList.add('aid-blur-target');
    showBadge(imgEl, 'blocked', result);
  }

  function removeBlockOverlay(imgEl) {
    imgEl.classList.remove('aid-blur-target');
  }

  function showBadge(imgEl, status, resultObj = null) {
    const parent = imgEl.parentElement;
    if (!parent) return;

    const postId = imgEl.dataset.aidId;
    parent.querySelector(`.aid-overlay-${postId}`)?.remove();

    const positionClass = (status === 'blocked') ? 'aid-pos-center' : 'aid-pos-edge';

    const wrapper = document.createElement('div');
    wrapper.className = `aid-overlay-container aid-overlay-${postId} ${positionClass}`;

    const badge = document.createElement('div');
    badge.className = `aid-badge aid-badge--${status}`;

    let score = 0;
    if (resultObj) {
      score = typeof resultObj === 'number' ? Math.round(resultObj) : Math.round(resultObj.trustScore || 0);
    }

    const text = {
      scanning: 'Scanning...',
      verified: `Real ${score}%`,
      blocked: `AI Detected`,
      heuristic: `~Real ${score}%`,
      error: 'Error'
    };

    badge.textContent = text[status] || text.scanning;
    wrapper.appendChild(badge);

    document.getElementById(`aid-tooltip-${postId}`)?.remove();

    if (status === 'blocked' && resultObj && typeof resultObj === 'object') {
      const tooltip = document.createElement('div');
      tooltip.className = 'aid-tooltip';
      tooltip.id = `aid-tooltip-${postId}`;
      
      const conf = resultObj.confidence ? Math.round(resultObj.confidence) : 0;
      const explanation = resultObj.explanation || "This image exhibits characteristics of AI generation or significant manipulation.";

      tooltip.innerHTML = `
        <div class="aid-tooltip-header">AI Content Details</div>
        <div class="aid-tooltip-score">
          <span>Realism: ${score}%</span>
          <span>Confidence: ${conf}%</span>
        </div>
        <div class="aid-tooltip-explanation">${explanation}</div>
      `;
      document.body.appendChild(tooltip);

      const showTooltip = (e) => {
        tooltip.classList.add('aid-tooltip-visible');
        let tX = e.clientX + 15;
        let tY = e.clientY + 15;
        if (tX + 280 > window.innerWidth) tX = e.clientX - 280;
        if (tY + 120 > window.innerHeight) tY = e.clientY - 120;
        tooltip.style.left = `${tX}px`;
        tooltip.style.top = `${tY}px`;
      };
      
      const hideTooltip = () => {
        tooltip.classList.remove('aid-tooltip-visible');
      };

      wrapper.addEventListener('mousemove', showTooltip);
      wrapper.addEventListener('mouseleave', hideTooltip);
      imgEl.addEventListener('mousemove', showTooltip);
      imgEl.addEventListener('mouseleave', hideTooltip);
    }

    if (status === 'heuristic' && resultObj && typeof resultObj === 'object') {
      const tooltip = document.createElement('div');
      tooltip.className = 'aid-tooltip';
      tooltip.id = `aid-tooltip-${postId}`;

      const conf = resultObj.confidence ? Math.round(resultObj.confidence) : 0;
      const explanation = resultObj.explanation || 'Basic heuristic scan only — no AI model was used.';

      tooltip.innerHTML = `
        <div class="aid-tooltip-header aid-tooltip-header--heuristic">Heuristic Estimate</div>
        <div class="aid-tooltip-score">
          <span>Realism: ${score}%</span>
          <span>Confidence: ${conf}%</span>
        </div>
        <div class="aid-tooltip-explanation">${explanation}</div>
        <div class="aid-tooltip-notice">⚠ Low-confidence estimate — no AI model used</div>
      `;
      document.body.appendChild(tooltip);

      const showTooltip = (e) => {
        tooltip.classList.add('aid-tooltip-visible');
        let tX = e.clientX + 15;
        let tY = e.clientY + 15;
        if (tX + 280 > window.innerWidth) tX = e.clientX - 280;
        if (tY + 130 > window.innerHeight) tY = e.clientY - 130;
        tooltip.style.left = `${tX}px`;
        tooltip.style.top = `${tY}px`;
      };

      const hideTooltip = () => {
        tooltip.classList.remove('aid-tooltip-visible');
      };

      wrapper.addEventListener('mousemove', showTooltip);
      wrapper.addEventListener('mouseleave', hideTooltip);
      imgEl.addEventListener('mousemove', showTooltip);
      imgEl.addEventListener('mouseleave', hideTooltip);
    }

    if (getComputedStyle(parent).position === 'static') {
      parent.style.position = 'relative';
    }

    parent.addEventListener('mouseenter', () => parent.classList.add('aid-container-hovered'));
    parent.addEventListener('mouseleave', () => parent.classList.remove('aid-container-hovered'));

    parent.appendChild(wrapper);
  }

  function scheduleScan() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(scanVisible, 500);
  }

  const observer = new MutationObserver(() => {
    if (scanningEnabled) scheduleScan();
  });

  function startObserver() {
    if (!document.body) {
      setTimeout(startObserver, 300);
      return;
    }

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    setTimeout(scanVisible, 1500);
  }

  startObserver();

})();