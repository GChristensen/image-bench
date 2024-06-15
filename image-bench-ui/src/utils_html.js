
export function animateColors(element, duration) {
    const originalBgColor = window.getComputedStyle(element).backgroundColor;
    const originalTextColor = window.getComputedStyle(element).color;

    const keyframes = `
        @keyframes colorAnimation {
            0% {
                background-color: ${originalBgColor};
                color: ${originalTextColor};
            }
            50% {
                background-color: white;
                color: black;
            }
            100% {
                background-color: ${originalBgColor};
                color: ${originalTextColor};
            }
        }
    `;

    const styleSheet = document.createElement("style");
    styleSheet.type = "text/css";
    styleSheet.innerText = keyframes;
    document.head.appendChild(styleSheet);

    element.style.animation = `colorAnimation ${duration}s forwards`;

    setTimeout(() => {
        document.head.removeChild(styleSheet);
    }, duration * 1000);
}

function getRandomHexColor() {
    // Ensure bright colors by emphasizing higher values for R, G, B
    const r = Math.floor(Math.random() * 128) + 128;
    const g = Math.floor(Math.random() * 128) + 128;
    const b = Math.floor(Math.random() * 128) + 128;
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function colorDifference(color1, color2) {
    const r1 = parseInt(color1.slice(1, 3), 16);
    const g1 = parseInt(color1.slice(3, 5), 16);
    const b1 = parseInt(color1.slice(5, 7), 16);

    const r2 = parseInt(color2.slice(1, 3), 16);
    const g2 = parseInt(color2.slice(3, 5), 16);
    const b2 = parseInt(color2.slice(5, 7), 16);

    // Simple Euclidean distance in RGB space
    return Math.sqrt(
        Math.pow(r2 - r1, 2) +
        Math.pow(g2 - g1, 2) +
        Math.pow(b2 - b1, 2)
    );
}

export function generateDistinctColors(count, minDifference) {
    const colors = [];
    while (colors.length < count) {
        const color = getRandomHexColor();
        if (colors.length == 0 || colorDifference(color, colors[colors.length - 1]) >= minDifference) {
            colors.push(color);
        }
    }
    return colors;
}
