function postTemplate(item) {
  let s = '<div class="notif';
  if (item.seen == 1) s += ' seen ';
  s += '">';
  s += '<img class="fb-icon" src="images/fbicon.png"/>';
  s += '<div class="post"';
  s += ' id=' + item.guid + '><a class="item_link" target="_blank" href=' + item.link + '>';
  s += '<p class="title">' + item.title + '</p>';
  s += '</a></div></div>';
  return s;
}

function renderStatus(status, notifCount) {
  const el = document.getElementById('status-text');
  if (!status) {
    el.textContent = 'Checking…';
    el.className = '';
    return;
  }
  if (!status.loggedIn) {
    el.textContent = 'Not logged in to Facebook';
    el.className = '';
    return;
  }
  if (status.error) {
    el.textContent = 'Error: ' + status.error;
    el.className = 'error';
    return;
  }
  const secsAgo = Math.round((Date.now() - status.lastChecked) / 1000);
  const timeStr = secsAgo < 60 ? secsAgo + 's ago' : Math.round(secsAgo / 60) + 'm ago';
  el.textContent = 'Last checked: ' + timeStr + ' · ' + notifCount + ' notification' + (notifCount !== 1 ? 's' : '');
  el.className = '';
}

function renderNotifs(notifs) {
  const div = document.getElementById('notifications-div');
  div.innerHTML = '';
  for (let i = 0; i < notifs.length; i++) {
    div.innerHTML += postTemplate(notifs[i]);
  }
  $('.post').click(function() {
    const guidOfClickedNotif = $(this).attr('id');
    chrome.storage.local.get(['seenNotifsGuids'], function(data) {
      const seenNotifsGuids = data.seenNotifsGuids || [];
      seenNotifsGuids.push(guidOfClickedNotif);
      chrome.storage.local.set({ seenNotifsGuids });
    });
  });
}

$(document).ready(function() {
  chrome.storage.local.get(['notifs', 'status'], function(result) {
    const notifs = result.notifs || [];
    renderStatus(result.status || null, notifs.length);
    renderNotifs(notifs);
  });

  // Update popup reactively whenever any poll completes
  chrome.storage.onChanged.addListener(function(changes) {
    if ('status' in changes || 'notifs' in changes) {
      chrome.storage.local.get(['notifs', 'status'], function(result) {
        const notifs = result.notifs || [];
        renderStatus(result.status || null, notifs.length);
        renderNotifs(notifs);
      });
    }
  });

  document.getElementById('check-now').addEventListener('click', function() {
    const btn = this;
    btn.disabled = true;
    document.getElementById('status-text').textContent = 'Checking…';
    document.getElementById('status-text').className = '';

    // Alarms reliably wake the service worker; sendMessage does not
    chrome.alarms.create('pollNow', { when: Date.now() + 100 });

    const timeout = setTimeout(function() { btn.disabled = false; }, 15000);

    function btnListener(changes) {
      if ('status' in changes) {
        clearTimeout(timeout);
        chrome.storage.onChanged.removeListener(btnListener);
        btn.disabled = false;
      }
    }
    chrome.storage.onChanged.addListener(btnListener);
  });
});
