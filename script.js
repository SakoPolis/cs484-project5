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

let map;
let currentRound = 0;
let score = 0;
let roundLocked = false;
let guessMarker = null;
let revealCircle = null;
let pulseCircle = null;
let pulseAnimationFrame = null;
let timerInterval = null;
let timerStartTime = null;
let timerElapsedMs = 0;
let highScore = null;

const roundCountEl = document.getElementById("round-count");
const scoreCountEl = document.getElementById("score-count");
const timeCountEl = document.getElementById("time-count");
const highScoreCountEl = document.getElementById("high-score-count");
const targetNameEl = document.getElementById("target-name");
const targetHelpEl = document.getElementById("target-help");
const feedbackEl = document.getElementById("feedback");
const nextButton = document.getElementById("next-button");
const restartButton = document.getElementById("restart-button");
const HIGH_SCORE_STORAGE_KEY = "csun-location-quiz-high-score";

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

function setFeedback(message, status) {
	feedbackEl.classList.remove("success", "error");
	if (status) {
		feedbackEl.classList.add(status);
	}
	feedbackEl.innerHTML = message;
}

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

function updateHighScoreDisplay() {
	if (!highScore) {
		highScoreCountEl.innerHTML = `<span class="stat-main">0 / ${locations.length}</span><span class="stat-sub">Best: --</span>`;
		return;
	}

	highScoreCountEl.innerHTML = `<span class="stat-main">${highScore.score} / ${locations.length}</span><span class="stat-sub">Best: ${formatElapsedTime(highScore.timeMs)}</span>`;
}

function formatElapsedTime(totalMilliseconds) {
	const totalSeconds = Math.floor(totalMilliseconds / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function updateTimerDisplay() {
	const elapsedMilliseconds = timerStartTime ? timerElapsedMs + (performance.now() - timerStartTime) : timerElapsedMs;
	timeCountEl.textContent = formatElapsedTime(elapsedMilliseconds);
}

function startTimer() {
	if (timerInterval) {
		clearInterval(timerInterval);
	}

	timerElapsedMs = 0;
	timerStartTime = performance.now();
	updateTimerDisplay();
	timerInterval = setInterval(updateTimerDisplay, 1000);
}

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

function updateSidebar() {
	roundCountEl.textContent = `${Math.min(currentRound + 1, locations.length)} / ${locations.length}`;
	scoreCountEl.textContent = score;
	const location = locations[currentRound];
	if (location) {
		targetNameEl.textContent = location.name;
		targetHelpEl.textContent = location.prompt;
	}
}

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
		const eased = 1 - Math.pow(1 - progress, 3);
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

function advanceRound() {
	if (currentRound === locations.length - 1) {
		finishQuiz();
		return;
	}

	goToRound(currentRound + 1);
}

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

	guessMarker = new google.maps.Marker({
		position: guess,
		map,
		title: "Your guess",
		animation: google.maps.Animation.DROP,
	});

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

function initMap() {
	loadHighScore();
	updateHighScoreDisplay();
	map = new google.maps.Map(document.getElementById("map"), {
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
		styles: [
			{ elementType: "geometry", stylers: [{ color: "#1f2937" }] },
			{ elementType: "labels.text.fill", stylers: [{ color: "#cbd5e1" }] },
			{ elementType: "labels.text.stroke", stylers: [{ color: "#0f172a" }] },
			{ featureType: "poi", elementType: "geometry", stylers: [{ color: "#273449" }] },
			{ featureType: "road", elementType: "geometry", stylers: [{ color: "#334155" }] },
			{ featureType: "water", elementType: "geometry", stylers: [{ color: "#0b2a4a" }] },
		],
	});

	const bounds = new google.maps.LatLngBounds();
	locations.forEach((location) => {
		bounds.extend({ lat: location.lat, lng: location.lng });
	});
	map.fitBounds(bounds, 80);

	map.addListener("dblclick", (event) => handleGuess(event.latLng));
	updateTimerDisplay();
	goToRound(0);
}

nextButton.addEventListener("click", advanceRound);
restartButton.addEventListener("click", () => {
	score = 0;
	currentRound = 0;
	timerElapsedMs = 0;
	timerStartTime = null;
	stopTimer();
	nextButton.textContent = "Next location";
	goToRound(0);
});

window.initMap = initMap;
