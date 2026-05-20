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

$(document).ready(function() {
  chrome.storage.local.get('notifs', function(result) {
    const notifs = result.notifs || [];
    for (let i = 0; i < notifs.length; i++) {
      document.getElementById('notifications-div').innerHTML += postTemplate(notifs[i]);
    }
    $('.post').click(function() {
      const guidOfClickedNotif = $(this).attr('id');
      chrome.storage.local.get(['seenNotifsGuids'], function(data) {
        const seenNotifsGuids = data.seenNotifsGuids || [];
        seenNotifsGuids.push(guidOfClickedNotif);
        chrome.storage.local.set({ seenNotifsGuids });
      });
    });
  });
});
