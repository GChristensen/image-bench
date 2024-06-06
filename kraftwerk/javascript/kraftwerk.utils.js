window.kraftwerk = window.kraftwerk || {};
kraftwerk = window.kraftwerk;

kraftwerk.utils = {
   sleep: function(ms) {
       return new Promise(rs => setTimeout(rs, ms));
   }
};

kraftwerk.utils.html = {
    setStyle: function setStyle(elements, style) {
        if (elements instanceof NodeList) {
            elements = Array.from(elements);
        } else if (elements instanceof Node){
            elements = [elements];
        } else {
            return;
        }
        elements.forEach(element => {
            for (let key in style) {
                if (style.hasOwnProperty(key)) {
                    element.style[key] = style[key];
                }
            }
        });
    },

    create: function create(type, props, style) {
        const element = document.createElement(type);
        if (props) {
            for (let key in props) {
                if (props.hasOwnProperty(key)) {
                    element[key] = props[key];
                }
            }
        }
        if (style) {
            this.setStyle(element, style);
        }
        return element;
    },

    createButton: function createButton(text, onclick) {
        const btn = document.createElement('button');
        btn.innerHTML = text;
        btn.onclick = onclick || function () {};
        btn.className = 'gr-button gr-button-lg gr-button-primary';
        return btn;
    },

    createHeaderButton: function createHeaderButton(title, text, className, style, action) {
        const button = kraftwerk.utils.html.create('button', {
            title: title,
            innerHTML: text,
            className: className,
        }, style);

        if (action) {
            button.addEventListener('click', action);
        }

        return button;
    }
};
