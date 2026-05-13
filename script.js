// QUIZ LOCATIONS: Array of CSUN campus locations with coordinates and acceptance radius (in meters)
const locations = [
	{
		name: "Alumni Relations",
		prompt: "Find Alumni Relations.",
		lat: 34.239949,
		lng: -118.535927,
		radius: 120,
	},
	{
		name: "B5 Parking Lot",
		prompt: "Find B5 Parking Lot.",
		lat: 34.2417749,
		lng: -118.5327007,
		radius: 120,
	},
	{
		name: "E6 Parking lot",
		prompt: "Find E6 Parking lot.",
		lat: 34.2426737,
		lng: -118.5292924,
		radius: 120,
	},
	{
		name: "G3 Parking lot",
		prompt: "Find G3 Parking lot.",
		lat: 34.2382265,
		lng: -118.5239944,
		radius: 120,
	},
	{
		name: "Hawaiian Hot Chicken",
		prompt: "Find Hawaiian Hot Chicken.",
		lat: 34.2499895,
		lng: -118.5195768,
		radius: 120,
	},
];

// STATE VARIABLES: Track quiz progress, map objects, and user performance
let map; // Google Maps instance
let currentRound = 0; // Current quiz round (0-4)
let score = 0; // Number of correct guesses (0-5)
let roundLocked = false; // Prevents multiple guesses per round
let guessMarker = null; // Marker placed at user's guess location
let revealCircle = null; // Circle showing target location and acceptance radius
let pulseCircle = null; // Animated pulse circle for visual feedback
let pulseAnimationFrame = null; // RequestAnimationFrame ID for pulse animation
let timerInterval = null; // SetInterval ID for timer updates
let timerStartTime = null; // Performance.now() timestamp when timer started
let timerElapsedMs = 0; // Total elapsed milliseconds
let highScore = null; // High score object {score, timeMs} from localStorage

// DOM ELEMENT REFERENCES: Cache frequently accessed UI elements
const roundCountEl = document.getElementById("round-count");
const scoreCountEl = document.getElementById("score-count");
const timeCountEl = document.getElementById("time-count");
const highScoreCountEl = document.getElementById("high-score-count");
const targetNameEl = document.getElementById("target-name");
const targetHelpEl = document.getElementById("target-help");
const feedbackEl = document.getElementById("feedback");
const nextButton = document.getElementById("next-button");
const restartButton = document.getElementById("restart-button");

// STORAGE KEY: LocalStorage key for persisting high score
const HIGH_SCORE_STORAGE_KEY = "csun-location-quiz-high-score";

// ===== UTILITY FUNCTIONS =====

// HAVERSINE DISTANCE: Calculate distance between two geographic points in meters
// Used to determine if a guess is within the acceptable radius of the target location
function haversineDistance(pointA, pointB) {
	const earthRadius = 6371000;
	const toRadians = (value) => (value * Math.PI) / 180;
	const deltaLat = toRadians(pointB.lat - pointA.lat);
	const deltaLng = toRadians(pointB.lng - pointA.lng);
	const lat1 = toRadians(pointA.lat);
	const lat2 = toRadians(pointB.lat);

	const a =
		Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
		Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return earthRadius * c;
}

// SET FEEDBACK: Update feedback message with optional success/error styling
function setFeedback(message, status) {
	feedbackEl.classList.remove("success", "error");
	if (status) {
		feedbackEl.classList.add(status);
	}
	feedbackEl.innerHTML = message;
}

// ===== HIGH SCORE MANAGEMENT =====

// LOAD HIGH SCORE: Retrieve high score from localStorage and validate data integrity
function loadHighScore() {
	try {
		const storedHighScore = localStorage.getItem(HIGH_SCORE_STORAGE_KEY);
		highScore = storedHighScore ? JSON.parse(storedHighScore) : null;
	} catch {
		highScore = null;
	}

	if (!highScore || typeof highScore.score !== "number" || typeof highScore.timeMs !== "number") {
		highScore = null;
	}
}

// SAVE HIGH SCORE: Persist high score to localStorage
function saveHighScore() {
	if (!highScore) {
		return;
	}

	try {
		localStorage.setItem(HIGH_SCORE_STORAGE_KEY, JSON.stringify(highScore));
	} catch {
		// Ignore storage failures in restricted browser modes.
	}
}

// UPDATE HIGH SCORE DISPLAY: Refresh sidebar high score card with current/best stats
function updateHighScoreDisplay() {
	if (!highScore) {
		highScoreCountEl.innerHTML = `<span class="stat-main">0 / ${locations.length}</span><span class="stat-sub">Best: --</span>`;
		return;
	}

	highScoreCountEl.innerHTML = `<span class="stat-main">${highScore.score} / ${locations.length}</span><span class="stat-sub">Best: ${formatElapsedTime(highScore.timeMs)}</span>`;
}

// ===== TIMER FUNCTIONS =====

// FORMAT ELAPSED TIME: Convert milliseconds to mm:ss display format
function formatElapsedTime(totalMilliseconds) {
	const totalSeconds = Math.floor(totalMilliseconds / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

// UPDATE TIMER DISPLAY: Refresh timer on sidebar with elapsed time
function updateTimerDisplay() {
	const elapsedMilliseconds = timerStartTime ? timerElapsedMs + (performance.now() - timerStartTime) : timerElapsedMs;
	timeCountEl.textContent = formatElapsedTime(elapsedMilliseconds);
}

// START TIMER: Initialize timer on first round
function startTimer() {
	if (timerInterval) {
		clearInterval(timerInterval);
	}

	timerElapsedMs = 0;
	timerStartTime = performance.now();
	updateTimerDisplay();
	timerInterval = setInterval(updateTimerDisplay, 1000);
}

// STOP TIMER: Stop timer on quiz completion, preserve elapsed time
function stopTimer() {
	if (timerStartTime !== null) {
		timerElapsedMs += performance.now() - timerStartTime;
		timerStartTime = null;
	}

	if (timerInterval) {
		clearInterval(timerInterval);
		timerInterval = null;
	}

	updateTimerDisplay();
}

// ===== MAP OVERLAY MANAGEMENT =====

// CLEAR OVERLAYS: Remove all map markers, circles, and animations
function clearOverlays() {
	if (pulseAnimationFrame) {
		cancelAnimationFrame(pulseAnimationFrame);
		pulseAnimationFrame = null;
	}

	if (pulseCircle) {
		pulseCircle.setMap(null);
		pulseCircle = null;
	}

	if (guessMarker) {
		guessMarker.setMap(null);
		guessMarker = null;
	}

	if (revealCircle) {
		revealCircle.setMap(null);
		revealCircle = null;
	}
}

// ===== SIDEBAR UI UPDATES =====

// UPDATE SIDEBAR: Refresh round counter, score, and target location name/prompt
function updateSidebar() {
	roundCountEl.textContent = `${Math.min(currentRound + 1, locations.length)} / ${locations.length}`;
	scoreCountEl.textContent = score;
	const location = locations[currentRound];
	if (location) {
		targetNameEl.textContent = location.name;
		targetHelpEl.textContent = location.prompt;
	}
}

// ===== QUIZ FLOW CONTROL =====

// FINISH QUIZ: Handle quiz completion, update high score if applicable, display final results
function finishQuiz() {
	roundLocked = true;
	stopTimer();
	if (score === locations.length) {
		if (!highScore || score > highScore.score || (score === highScore.score && timerElapsedMs < highScore.timeMs)) {
			highScore = {
				score,
				timeMs: timerElapsedMs,
			};
			saveHighScore();
			updateHighScoreDisplay();
		}
	}
	nextButton.disabled = true;
	nextButton.textContent = "Quiz complete";
	setFeedback(
		`Final score: <strong>${score} out of ${locations.length}</strong> in <strong>${timeCountEl.textContent}</strong>.${score === locations.length && highScore && highScore.score === score && highScore.timeMs === timerElapsedMs ? " New high score." : ""} Hit restart to try the round again.`,
		score === locations.length ? "success" : "error"
	);
}

// GO TO ROUND: Initialize specified round, clear overlays, start timer if first round
function goToRound(index) {
	currentRound = index;
	roundLocked = false;
	nextButton.disabled = true;
	nextButton.textContent = currentRound === locations.length - 1 ? "Finish quiz" : "Next location";
	clearOverlays();
	updateSidebar();
	if (currentRound === 0 && timerStartTime === null && timerElapsedMs === 0) {
		startTimer();
	}
	setFeedback("Waiting for your guess.");
}

// ANIMATE PULSE: Create expanding, fading circle animation for visual feedback
// Parameters: center (LatLng), color (hex string for success/error)
function animatePulse(center, color) {
	if (pulseAnimationFrame) {
		cancelAnimationFrame(pulseAnimationFrame);
		pulseAnimationFrame = null;
	}

	if (pulseCircle) {
		pulseCircle.setMap(null);
	}

	pulseCircle = new google.maps.Circle({
		map,
		center,
		radius: 0,
		strokeColor: color,
		strokeOpacity: 0.85,
		strokeWeight: 2,
		fillColor: color,
		fillOpacity: 0.18,
	});

	const maxRadius = 160;
	const duration = 900;
	const startTime = performance.now();

	const step = (now) => {
		const elapsed = now - startTime;
		const progress = Math.min(elapsed / duration, 1);
		const eased = 1 - Math.pow(1 - progress, 3); // Cubic easing for smooth animation
		const radius = 20 + eased * maxRadius;
		const opacity = 0.18 * (1 - progress);

		pulseCircle.setOptions({
			radius,
			strokeOpacity: 0.85 * (1 - progress),
			fillOpacity: opacity,
		});

		if (progress < 1) {
			pulseAnimationFrame = requestAnimationFrame(step);
		} else {
			pulseAnimationFrame = null;
			if (pulseCircle) {
				pulseCircle.setMap(null);
				pulseCircle = null;
			}
		}
	};

	pulseAnimationFrame = requestAnimationFrame(step);
}

// ADVANCE ROUND: Move to next round or finish quiz if final round
function advanceRound() {
	if (currentRound === locations.length - 1) {
		finishQuiz();
		return;
	}

	goToRound(currentRound + 1);
}

// HANDLE GUESS: Process user's double-click guess, calculate distance, show feedback
// Parameters: latLng (Google Maps LatLng object from double-click event)
function handleGuess(latLng) {
	if (roundLocked) {
		return;
	}

	roundLocked = true;
	const target = locations[currentRound];
	const guess = { lat: latLng.lat(), lng: latLng.lng() };
	const targetPoint = { lat: target.lat, lng: target.lng };
	const distance = haversineDistance(guess, targetPoint);
	const correct = distance <= target.radius;

	// Place marker at user's guess location
	guessMarker = new google.maps.Marker({
		position: guess,
		map,
		title: "Your guess",
		animation: google.maps.Animation.DROP,
	});

	// Draw circle showing target location and acceptance radius
	revealCircle = new google.maps.Circle({
		map,
		center: targetPoint,
		radius: target.radius,
		strokeColor: correct ? "#16a34a" : "#dc2626",
		strokeOpacity: 0.9,
		strokeWeight: 2,
		fillColor: correct ? "#16a34a" : "#dc2626",
		fillOpacity: 0.3,
	});
	animatePulse(targetPoint, correct ? "#16a34a" : "#dc2626");

	if (correct) {
		score += 1;
		setFeedback(
			`Correct. <strong>${target.name}</strong> was within ${Math.round(distance)} meters of your guess.`,
			"success"
		);
	} else {
		setFeedback(
			`Incorrect. The correct location was <strong>${target.name}</strong>, about ${Math.round(distance)} meters from your guess.`,
			"error"
		);
	}

	scoreCountEl.textContent = score;
	if (currentRound === locations.length - 1) {
		nextButton.disabled = true;
		setTimeout(finishQuiz, 1200);
	} else {
		nextButton.disabled = false;
	}
}

// ===== MAP INITIALIZATION =====

// INIT MAP: Initialize Google Maps, load high score, set up event listeners
// Called by Google Maps API callback after script loads
function initMap() {
	loadHighScore();
	updateHighScoreDisplay();
	
	// Create map with disabled UI controls and dark theme styling
	map = new google.maps.Map(document.getElementById("map"), {
        //presentation requirement1: https://developers.google.com/maps/documentation/javascript/controls
		disableDefaultUI: true,
		draggable: false,
		gestureHandling: "none",
		keyboardShortcuts: false,
		scrollwheel: false,
		disableDoubleClickZoom: true,
		mapTypeControl: false,
		streetViewControl: false,
		fullscreenControl: false,
		clickableIcons: false,
        //presentation requirement2: https://developers.google.com/maps/documentation/javascript/json-styling-overview
		styles: [
			{ elementType: "geometry", stylers: [{ color: "#1f2937" }] },
			{ elementType: "labels.text.fill", stylers: [{ color: "#cbd5e1" }] },
			{ elementType: "labels.text.stroke", stylers: [{ color: "#0f172a" }] },
			{ featureType: "poi", elementType: "geometry", stylers: [{ color: "#273449" }] },
			{ featureType: "road", elementType: "geometry", stylers: [{ color: "#334155" }] },
			{ featureType: "water", elementType: "geometry", stylers: [{ color: "#0b2a4a" }] },
		],
	});

	// Fit map to show all locations
	const bounds = new google.maps.LatLngBounds();
	locations.forEach((location) => {
		bounds.extend({ lat: location.lat, lng: location.lng });
	});
	map.fitBounds(bounds, 80);

	// Register double-click handler for guesses
	map.addListener("dblclick", (event) => handleGuess(event.latLng));
	updateTimerDisplay();
	goToRound(0);
}

// ===== EVENT LISTENERS =====

// Next button: Advance to next round or finish quiz
nextButton.addEventListener("click", advanceRound);

// Restart button: Reset all stats and start quiz from beginning
restartButton.addEventListener("click", () => {
	score = 0;
	currentRound = 0;
	timerElapsedMs = 0;
	timerStartTime = null;
	stopTimer();
	nextButton.textContent = "Next location";
	goToRound(0);
});

// Export initMap for Google Maps API callback
window.initMap = initMap;
