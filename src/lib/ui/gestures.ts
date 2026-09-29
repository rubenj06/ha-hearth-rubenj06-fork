/*
 * A pointerdown taken by a control's own drag (a tile's brightness slide), so
 * a gesture further up the tree leaves it alone. Pointer capture cannot tell:
 * every touch is implicitly captured by the element it lands on.
 */
const claimed = new WeakSet<Event>();

export function claimGesture(event: Event) {
	claimed.add(event);
}

export function gestureClaimed(event: Event): boolean {
	return claimed.has(event);
}

/*
 * Eats the click that follows the current pointer release, at the window, so
 * it never reaches whatever sits under the pointer: a card under a wake tap
 * once the overlay is gone, or the tile a swipe started on. The click follows
 * pointerup almost immediately; if none comes (a cancelled or dragged touch),
 * stop waiting. Call it before the pointerup, so the short wait starts there.
 */
export function swallowNextClick() {
	let timer = setTimeout(stop, 5000);
	const swallow = (event: Event) => {
		event.preventDefault();
		event.stopPropagation();
		stop();
	};
	const arm = () => {
		clearTimeout(timer);
		timer = setTimeout(stop, 300);
	};
	function stop() {
		clearTimeout(timer);
		window.removeEventListener('click', swallow, true);
		window.removeEventListener('pointerup', arm, true);
		window.removeEventListener('pointercancel', stop, true);
	}
	window.addEventListener('click', swallow, true);
	window.addEventListener('pointerup', arm, true);
	window.addEventListener('pointercancel', stop, true);
}
