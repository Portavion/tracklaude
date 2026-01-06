(function() {
  'use strict';

  const SESSION_WINDOW_MINUTES = 5 * 60; // 5 hours
  const WEEKLY_WINDOW_MINUTES = 7 * 24 * 60; // 7 days
  const UPDATE_INTERVAL_MS = 60 * 1000; // 1 minute

  let updateIntervalId = null;

  // Parse "Resets in X hr Y min" or "Resets in Y min" format
  function parseSessionResetTime(text) {
    const match = text.match(/Resets in (?:(\d+)\s*hr?)?\s*(?:(\d+)\s*min)?/i);
    if (!match) return null;

    const hours = parseInt(match[1]) || 0;
    const minutes = parseInt(match[2]) || 0;
    return hours * 60 + minutes;
  }

  // Parse "Resets Sat 8:59 AM" or "Resets Tomorrow 8:59 AM" format
  function parseWeeklyResetTime(text) {
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
    const elapsedMinutes = totalWindowMinutes - remainingMinutes;
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

  // Find and process usage bars
  function injectTimeBars() {
    // Remove existing time bars first
    document.querySelectorAll('.claude-ext-time-bar').forEach(el => el.remove());

    // Find all usage bar containers by looking for the label text
    const allParagraphs = document.querySelectorAll('p');

    allParagraphs.forEach(p => {
      const text = p.textContent.trim();

      if (text === 'Current session' || text === 'All models' || text === 'Sonnet only') {
        const isSession = text === 'Current session';
        const isWeekly = text === 'All models' || text === 'Sonnet only';

        // Find the parent container (the flex row)
        const rowContainer = p.closest('.w-full.flex.flex-row');
        if (!rowContainer) return;

        // Find the reset time text (sibling paragraph)
        const labelContainer = p.closest('.flex.flex-col');
        if (!labelContainer) return;

        const resetTextEl = labelContainer.querySelector('p.text-text-400');
        if (!resetTextEl) return;

        const resetText = resetTextEl.textContent.trim();

        let remainingMinutes;
        let totalWindowMinutes;

        if (isSession) {
          remainingMinutes = parseSessionResetTime(resetText);
          totalWindowMinutes = SESSION_WINDOW_MINUTES;
        } else {
          remainingMinutes = parseWeeklyResetTime(resetText);
          totalWindowMinutes = WEEKLY_WINDOW_MINUTES;
        }

        if (remainingMinutes === null) return;

        const { percent, elapsedMinutes } = calculateTimeElapsed(remainingMinutes, totalWindowMinutes);
        const timeBar = createTimeBar(percent, elapsedMinutes, isWeekly);

        // Insert after the row container
        rowContainer.parentNode.insertBefore(timeBar, rowContainer.nextSibling);
      }
    });
  }

  // Initialize with MutationObserver for SPA navigation
  function init() {
    // Initial injection attempt
    injectTimeBars();

    // Set up periodic updates
    if (updateIntervalId) clearInterval(updateIntervalId);
    updateIntervalId = setInterval(injectTimeBars, UPDATE_INTERVAL_MS);

    // Watch for DOM changes (SPA navigation)
    const observer = new MutationObserver((mutations) => {
      // Check if we're on the usage page and bars exist
      if (window.location.pathname === '/settings/usage') {
        const hasExistingTimeBars = document.querySelector('.claude-ext-time-bar');
        const hasUsageBars = document.querySelector('p.text-text-100');

        if (!hasExistingTimeBars && hasUsageBars) {
          injectTimeBars();
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
