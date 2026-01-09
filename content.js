(function() {
  'use strict';

  const SESSION_WINDOW_MINUTES = 5 * 60; // 5 hours
  const WEEKLY_WINDOW_MINUTES = 7 * 24 * 60; // 7 days
  const UPDATE_INTERVAL_MS = 60 * 1000; // 1 minute

  let updateIntervalId = null;

  // Parse "Resets in Xd Y hr Z min" / "Resets in X hr Y min" / "Resets in Y min" format
  function parseRelativeResetTime(text) {
    const match = text.match(/Resets in\s*(?:(\d+)\s*d(?:ays?)?)?\s*(?:(\d+)\s*h(?:rs?|ours?)?)?\s*(?:(\d+)\s*m(?:ins?|inutes?)?)?/i);
    if (!match) return null;

    const days = parseInt(match[1]) || 0;
    const hours = parseInt(match[2]) || 0;
    const minutes = parseInt(match[3]) || 0;
    return (days * 24 * 60) + (hours * 60) + minutes;
  }

  function parseSessionResetTime(text) {
    return parseRelativeResetTime(text);
  }

  // Parse "Resets Sat 8:59 AM" or "Resets Tomorrow 8:59 AM" format
  function parseWeeklyResetTime(text) {
    const relativeMinutes = parseRelativeResetTime(text);
    if (relativeMinutes !== null) return relativeMinutes;

    const dayTimeMatch = text.match(/Resets\s+(\w+)\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!dayTimeMatch) return null;

    const dayStr = dayTimeMatch[1];
    let hours = parseInt(dayTimeMatch[2]);
    const minutes = parseInt(dayTimeMatch[3]);
    const meridiem = dayTimeMatch[4].toUpperCase();

    // Convert to 24-hour format
    if (meridiem === 'PM' && hours !== 12) hours += 12;
    if (meridiem === 'AM' && hours === 12) hours = 0;

    const now = new Date();
    const resetDate = new Date();
    resetDate.setHours(hours, minutes, 0, 0);

    // Handle day of week
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayIndex = days.findIndex(d => dayStr.toLowerCase().startsWith(d.toLowerCase()));

    if (dayStr.toLowerCase() === 'tomorrow') {
      resetDate.setDate(now.getDate() + 1);
    } else if (dayStr.toLowerCase() === 'today') {
      // Keep current date
    } else if (dayIndex !== -1) {
      const currentDay = now.getDay();
      let daysUntilReset = dayIndex - currentDay;
      if (daysUntilReset <= 0) daysUntilReset += 7;
      resetDate.setDate(now.getDate() + daysUntilReset);
    } else {
      return null;
    }

    const diffMs = resetDate.getTime() - now.getTime();
    return Math.max(0, Math.floor(diffMs / (1000 * 60)));
  }

  // Calculate time elapsed percentage and minutes
  function calculateTimeElapsed(remainingMinutes, totalWindowMinutes) {
    const elapsedMinutes = Math.max(0, totalWindowMinutes - remainingMinutes);
    const percent = Math.min(100, Math.max(0, (elapsedMinutes / totalWindowMinutes) * 100));
    return { percent, elapsedMinutes };
  }

  // Format elapsed time as "Xh Ym" or "Xd Yh"
  function formatElapsedTime(elapsedMinutes, isWeekly) {
    if (isWeekly) {
      const days = Math.floor(elapsedMinutes / (24 * 60));
      const hours = Math.floor((elapsedMinutes % (24 * 60)) / 60);
      if (days > 0) {
        return `${days}d ${hours}h elapsed`;
      }
      return `${hours}h elapsed`;
    } else {
      const hours = Math.floor(elapsedMinutes / 60);
      const mins = Math.floor(elapsedMinutes % 60);
      if (hours > 0) {
        return `${hours}h ${mins}m elapsed`;
      }
      return `${mins}m elapsed`;
    }
  }

  // Create time bar HTML element with left-side label
  function createTimeBar(elapsedPercent, elapsedMinutes, isWeekly) {
    const container = document.createElement('div');
    container.className = 'claude-ext-time-bar w-full flex flex-row gap-x-8 gap-y-3 justify-between items-center flex-wrap';
    container.style.cssText = 'margin-top: 8px;';

    const rounded = Math.round(elapsedPercent);
    const elapsedText = formatElapsedTime(elapsedMinutes, isWeekly);

    container.innerHTML = `
      <div class="flex flex-col gap-1.5 min-w-0 w-[13rem] shrink-0">
        <p class="font-base text-text-100">Time elapsed</p>
        <p class="font-base text-text-400 whitespace-nowrap">${elapsedText}</p>
      </div>
      <div class="flex-1 flex items-center gap-3 md:max-w-xl">
        <div class="flex-1 min-w-[200px]">
          <div class="w-full bg-bg-000 rounded border border-border-300 shadow-sm h-4 flex items-center">
            <div class="h-full rounded transition-all" style="width: ${rounded}%; background-color: hsl(var(--accent-main-100));"></div>
          </div>
        </div>
        <p class="font-base text-text-400 whitespace-nowrap text-right min-w-[5.5rem]">${rounded}% time</p>
      </div>
    `;

    return container;
  }

  function normalizeText(text) {
    return text.replace(/\s+/g, ' ').trim();
  }

  function isElementHidden(element) {
    if (!element) return true;
    if (element.closest('[aria-hidden="true"]')) return true;
    const className = typeof element.className === 'string' ? element.className : '';
    if (className.includes('sr-only')) return true;
    return false;
  }

  function classifyLabel(text) {
    const normalized = normalizeText(text);
    const lower = normalized.toLowerCase();

    if (lower.includes('current session')) {
      return { type: 'session', labelText: normalized };
    }

    if (lower.includes('all models') && normalized.length <= 40) {
      return { type: 'weekly', labelText: normalized };
    }

    if (lower.includes('sonnet') && !lower.includes('includes') && normalized.length <= 40) {
      return { type: 'weekly', labelText: normalized };
    }

    return null;
  }

  function findLabelElements() {
    const results = [];
    const seen = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);

    while (walker.nextNode()) {
      const node = walker.currentNode;
      const text = node.textContent;
      if (!text) continue;

      const info = classifyLabel(text);
      if (!info) continue;

      const element = node.parentElement;
      if (!element || isElementHidden(element)) continue;
      if (seen.has(element)) continue;

      seen.add(element);
      results.push({ element, type: info.type, labelText: info.labelText });
    }

    return results;
  }

  function findTextElement(container, pattern) {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const text = normalizeText(walker.currentNode.textContent || '');
      if (pattern.test(text)) {
        return walker.currentNode.parentElement;
      }
    }
    return null;
  }

  function findResetTextElement(startElement) {
    let current = startElement;
    for (let i = 0; i < 4 && current; i += 1) {
      const resetEl = findTextElement(current, /^Resets\b/i);
      if (resetEl) return resetEl;
      current = current.parentElement;
    }
    return null;
  }

  function findRowContainer(labelElement, resetTextElement) {
    return (
      labelElement.closest('.w-full.flex.flex-row') ||
      labelElement.closest('[class*="flex-row"]') ||
      (resetTextElement && resetTextElement.closest('[class*="flex-row"]')) ||
      labelElement.closest('[class*="flex"]') ||
      labelElement.parentElement
    );
  }

  function getUsageEntries() {
    const labels = findLabelElements();
    const entries = [];
    const usedRows = new Set();

    labels.forEach(({ element, type, labelText }) => {
      const resetTextEl = findResetTextElement(element);
      if (!resetTextEl) return;

      const rowContainer = findRowContainer(element, resetTextEl);
      if (!rowContainer || usedRows.has(rowContainer)) return;

      usedRows.add(rowContainer);

      entries.push({
        labelText,
        type,
        resetText: normalizeText(resetTextEl.textContent || ''),
        rowContainer
      });
    });

    return entries;
  }

  // Find and process usage bars
  function injectTimeBars() {
    // Remove existing time bars first
    document.querySelectorAll('.claude-ext-time-bar').forEach(el => el.remove());

    const entries = getUsageEntries();

    entries.forEach(entry => {
      const isSession = entry.type === 'session';
      const isWeekly = !isSession;
      const totalWindowMinutes = isSession ? SESSION_WINDOW_MINUTES : WEEKLY_WINDOW_MINUTES;
      const remainingMinutes = isSession
        ? parseSessionResetTime(entry.resetText)
        : parseWeeklyResetTime(entry.resetText);

      if (remainingMinutes === null) return;

      const { percent, elapsedMinutes } = calculateTimeElapsed(remainingMinutes, totalWindowMinutes);
      const timeBar = createTimeBar(percent, elapsedMinutes, isWeekly);

      entry.rowContainer.parentNode.insertBefore(timeBar, entry.rowContainer.nextSibling);
    });
  }

  // Store last known reset times to detect changes
  let lastResetTimes = {};

  // Get current reset times from the page
  function getCurrentResetTimes() {
    const resetTimes = {};
    const entries = getUsageEntries();

    entries.forEach(entry => {
      resetTimes[entry.labelText] = entry.resetText;
    });

    return resetTimes;
  }

  // Check if reset times have changed
  function haveResetTimesChanged() {
    const currentTimes = getCurrentResetTimes();
    const keys = Object.keys(currentTimes);

    if (keys.length === 0) return false;

    for (const key of keys) {
      if (lastResetTimes[key] !== currentTimes[key]) {
        lastResetTimes = currentTimes;
        return true;
      }
    }

    return false;
  }

  // Initialize with MutationObserver for SPA navigation and usage refresh
  function init() {
    // Initial injection attempt
    injectTimeBars();
    lastResetTimes = getCurrentResetTimes();

    // Set up periodic updates
    if (updateIntervalId) clearInterval(updateIntervalId);
    updateIntervalId = setInterval(injectTimeBars, UPDATE_INTERVAL_MS);

    // Debounce timer for mutation observer
    let debounceTimer = null;

    // Watch for DOM changes (SPA navigation and usage data updates)
    const observer = new MutationObserver((mutations) => {
      // Check if we're on the usage page
      if (window.location.pathname !== '/settings/usage') return;

      const hasUsageBars = getUsageEntries().length > 0;
      if (!hasUsageBars) return;

      const hasExistingTimeBars = document.querySelector('.claude-ext-time-bar');

      // If no time bars exist, inject them immediately
      if (!hasExistingTimeBars) {
        injectTimeBars();
        lastResetTimes = getCurrentResetTimes();
        return;
      }

      // Debounce the check for reset time changes to avoid excessive updates
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (haveResetTimesChanged()) {
          injectTimeBars();
        }
      }, 100);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
