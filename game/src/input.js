// Aurelia Bay — keyboard, mouse and one-shot action flags.
// One job: turn raw DOM events into a clean per-frame input state the
// game loop reads. Nothing here knows about the game rules.

export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set(); // keys pressed since the last frame was read
  let mouseDX = 0;
  let mouseDY = 0;
  let mouseDown = false;
  let clicked = false;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  function codeOf(event) {
    return event.code || event.key || '';
  }

  window.addEventListener('keydown', (event) => {
    const code = codeOf(event);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(code)) event.preventDefault();
    if (!event.repeat) pressed.add(code);
    keys.add(code);
  });
  window.addEventListener('keyup', (event) => {
    keys.delete(codeOf(event));
  });
  window.addEventListener('blur', () => {
    keys.clear();
    pressed.clear();
    dragging = false;
    mouseDown = false;
  });

  canvas.addEventListener('mousedown', (event) => {
    dragging = true;
    mouseDown = true;
    lastX = event.clientX;
    lastY = event.clientY;
  });
  window.addEventListener('mouseup', (event) => {
    if (mouseDown && event.target === canvas) clicked = true;
    mouseDown = false;
    dragging = false;
  });
  window.addEventListener('mousemove', (event) => {
    if (!dragging) return;
    mouseDX += event.clientX - lastX;
    mouseDY += event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  // Read-and-clear: the loop calls this once per frame.
  function read() {
    const state = {
      forward: keys.has('KeyW') || keys.has('ArrowUp'),
      back: keys.has('KeyS') || keys.has('ArrowDown'),
      left: keys.has('KeyA') || keys.has('ArrowLeft'),
      right: keys.has('KeyD') || keys.has('ArrowRight'),
      sprint: keys.has('ShiftLeft') || keys.has('ShiftRight'),
      handbrake: keys.has('Space'),
      interact: pressed.has('KeyE'),
      punch: pressed.has('KeyF'),
      taxi: pressed.has('KeyT'),
      radio: pressed.has('KeyR'),
      mute: pressed.has('KeyM'),
      pause: pressed.has('KeyP') || pressed.has('Escape'),
      shoot: clicked,
      mouseDX,
      mouseDY,
    };
    pressed.clear();
    mouseDX = 0;
    mouseDY = 0;
    clicked = false;
    return state;
  }

  // Test hooks: the play-test driver can press keys without a real keyboard.
  function press(code) {
    pressed.add(code);
    keys.add(code);
  }

  function release(code) {
    keys.delete(code);
  }

  // Forget every held and queued key (tab switches, overlays).
  function clear() {
    keys.clear();
    pressed.clear();
  }

  return { keys, read, press, release, clear };
}
