
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
