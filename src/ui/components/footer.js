function footer() {
  return `
<div class="donation">
    <p>Did this magic solve your TV's subtitle problem? 🦡<br>If you can, buy me a coffee to keep the cauldron bubbling!</p>
    <div style="display:flex;align-items:center;justify-content:center;gap:16px;flex-wrap:wrap;">
      <a href='https://ko-fi.com/G4H521S5GK' target='_blank'><img height='36' style='border:0px;height:36px;' src='https://storage.ko-fi.com/cdn/kofi5.png?v=6' border='0' alt='Buy Me a Coffee at ko-fi.com' /></a>
      <a href='https://livepix.gg/texugo7badger' target='_blank'><img height='36' style='border:0px;height:36px;border-radius:8px;' src='https://i.imgur.com/jjPuVUG.png' border='0' alt='Doe via LivePix (PIX)' /></a>
    </div>
    <div style="margin-top:16px;text-align:center;">
      <a href='https://livepix.gg/texugo7badger' target='_blank'><img width='150' style='border:0px;' src='https://i.imgur.com/8op6gjT.png' border='0' alt='Escaneie o QR Code para doar via LivePix' /></a>
      <br><small>Escaneie o QR Code → Doe via <b>LivePix (PIX)</b></small>
    </div>
</div>
<script src='https://storage.ko-fi.com/cdn/scripts/overlay-widget.js'></script>
<script>
  kofiWidgetOverlay.draw('texugo7badger', {
    'type': 'floating-chat',
    'floating-chat.donateButton.text': 'Support me',
    'floating-chat.donateButton.background-color': '#794bc4',
    'floating-chat.donateButton.text-color': '#fff'
  });
</script>
  `;
}
module.exports = footer;