function parseRSS(text) {
  const notifs = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(text)) !== null) {
    const block = match[1];
    const getTag = tag => {
      const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
      return m ? m[1].trim() : '';
    };
    notifs.push({
      guid: getTag('guid').split('/')[2] || '',
      title: getTag('title'),
      link: getTag('link'),
      description: getTag('description'),
      pubDate: getTag('pubDate'),
      author: getTag('author'),
      seen: 0,
      notified: 0
    });
  }
  return notifs;
}

chrome.runtime.onInstalled.addListener(setupAlarm);
chrome.runtime.onStartup.addListener(setupAlarm);

function setupAlarm() {
  chrome.alarms.get('pollNotifications', function(existing) {
    if (!existing) {
      chrome.alarms.create('pollNotifications', { periodInMinutes: 1 });
    }
  });
  pollNotifications();
}

chrome.alarms.onAlarm.addListener(function(alarm) {
  if (alarm.name === 'pollNotifications' || alarm.name === 'pollNow') {
    pollNotifications();
  }
});

function getStorage(keys) {
  return new Promise(resolve => chrome.storage.local.get(keys, resolve));
}

function setStorage(data) {
  return new Promise(resolve => chrome.storage.local.set(data, resolve));
}

async function pollNotifications() {
  const cookies = await new Promise(resolve =>
    chrome.cookies.getAll({ domain: '.facebook.com' }, resolve)
  );

  const cUserCookie = cookies.find(c => c.name === 'c_user');

  if (!cUserCookie) {
    await setStorage({ fbRssUrl: null, status: { loggedIn: false, lastChecked: Date.now(), error: null } });
    return;
  }

  const stored = await getStorage(['c_user', 'fbRssUrl']);
  let fbRssUrl = stored.fbRssUrl;

  if (stored.c_user !== cUserCookie.value || !fbRssUrl) {
    try {
      const response = await fetch('https://www.facebook.com/notifications');
      const text = await response.text();
      const y = text.indexOf('rss20');
      const z = text.lastIndexOf('href="/feeds/notifications.php', y);
      if (y !== -1 && z !== -1) {
        fbRssUrl = 'https://www.facebook.com' + text.substring(z + 6, y + 5).replace(/&amp;/g, '&');
        await setStorage({ c_user: cUserCookie.value, fbRssUrl });
      }
    } catch (e) {
      console.error('Failed to fetch notifications page:', e);
      await setStorage({ status: { loggedIn: true, lastChecked: Date.now(), error: e.message } });
      return;
    }
  }

  if (!fbRssUrl) return;

  try {
    const response = await fetch(fbRssUrl);
    const text = await response.text();
    const notifs = parseRSS(text);

    const data = await getStorage(['seenNotifsGuids', 'notifiedNotifsGuids']);
    let seenNotifsGuids = data.seenNotifsGuids || [];
    let notifiedNotifsGuids = data.notifiedNotifsGuids || [];

    for (let k = notifs.length - 1; k >= 0; k--) {
      if (!notifiedNotifsGuids.includes(notifs[k].guid)) {
        chrome.notifications.create(notifs[k].guid + '^' + notifs[k].link, {
          type: 'basic',
          iconUrl: 'images/fbicon.png',
          title: 'Facebook Notification',
          message: notifs[k].title,
          buttons: [{ title: 'Mark as read' }],
          isClickable: true
        });
        notifiedNotifsGuids.push(notifs[k].guid);
        notifs[k].notified = 1;
      }
    }

    const toBeDeleted = seenNotifsGuids.filter(guid =>
      !notifs.some(n => n.guid === guid)
    );

    seenNotifsGuids = seenNotifsGuids.filter(g => !toBeDeleted.includes(g));
    notifiedNotifsGuids = notifiedNotifsGuids.filter(g => !toBeDeleted.includes(g));

    for (const notif of notifs) {
      if (seenNotifsGuids.includes(notif.guid)) {
        notif.seen = 1;
      }
    }

    await setStorage({
      notifs,
      seenNotifsGuids,
      notifiedNotifsGuids,
      status: { loggedIn: true, lastChecked: Date.now(), error: null }
    });
  } catch (e) {
    console.error('Failed to fetch RSS feed:', e);
    await setStorage({ status: { loggedIn: true, lastChecked: Date.now(), error: e.message } });
  }
}

chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.action === 'pollNow') {
    pollNotifications().then(() => sendResponse({ done: true }));
    return true;
  }
});

function markSeen(guidAndLink) {
  const guid = guidAndLink.split('^')[0];
  const link = guidAndLink.slice(guid.length + 1);
  chrome.storage.local.get(['seenNotifsGuids'], function(data) {
    const seenNotifsGuids = data.seenNotifsGuids || [];
    seenNotifsGuids.push(guid);
    chrome.storage.local.set({ seenNotifsGuids });
  });
  return link;
}

chrome.notifications.onClicked.addListener(function(guidAndLink) {
  const link = markSeen(guidAndLink);
  chrome.tabs.create({ url: link });
});

chrome.notifications.onButtonClicked.addListener(function(guidAndLink) {
  markSeen(guidAndLink);
});
