// =====================================================
// DROPDOWNS PERSONALIZADOS MODERNOS (UNIVERSAL ADMIN)
// =====================================================

(function () {
    "use strict";

    function setupCustomDropdown(selectElement) {
        if (!selectElement || selectElement.dataset.customized === "true") return;
        if (selectElement.classList.contains("portal-hidden-select")) return;

        selectElement.dataset.customized = "true";
        selectElement.classList.add("portal-hidden-select");

        const wrapper = document.createElement("div");
        wrapper.className = "custom-dropdown";
        
        if (selectElement.classList.contains("recharge-service-select")) {
            wrapper.classList.add("custom-dropdown-recharge");
        }
        if (selectElement.classList.contains("admin-assignment-select")) {
            wrapper.classList.add("custom-dropdown-assignment");
        }

        const trigger = document.createElement("button");
        trigger.type = "button";
        trigger.className = "custom-dropdown-trigger";
        trigger.setAttribute("aria-haspopup", "listbox");
        trigger.setAttribute("aria-expanded", "false");

        const triggerText = document.createElement("span");
        triggerText.className = "trigger-text";
        trigger.appendChild(triggerText);

        const chevron = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        chevron.setAttribute("class", "trigger-chevron");
        chevron.setAttribute("width", "15");
        chevron.setAttribute("height", "15");
        chevron.setAttribute("viewBox", "0 0 24 24");
        chevron.setAttribute("fill", "none");
        chevron.setAttribute("stroke", "currentColor");
        chevron.setAttribute("stroke-width", "2.2");
        chevron.setAttribute("stroke-linecap", "round");
        chevron.setAttribute("stroke-linejoin", "round");
        chevron.innerHTML = '<path d="m6 9 6 6 6-6"/>';
        trigger.appendChild(chevron);

        const menu = document.createElement("div");
        menu.className = "custom-dropdown-menu";
        menu.setAttribute("role", "listbox");
        menu.style.display = "none";

        function updateTriggerText() {
            const selectedOpt = selectElement.options[selectElement.selectedIndex] || selectElement.options[0];
            if (selectedOpt) {
                triggerText.textContent = selectedOpt.text;
                if (!selectedOpt.value && selectedOpt.value !== "0") {
                    triggerText.classList.add("is-placeholder");
                } else {
                    triggerText.classList.remove("is-placeholder");
                }
            }
        }

        function populateMenu() {
            menu.innerHTML = "";
            Array.from(selectElement.options).forEach(function (opt) {
                const optDiv = document.createElement("div");
                optDiv.className = "custom-dropdown-option";
                optDiv.setAttribute("role", "option");
                optDiv.dataset.value = opt.value;

                if (opt.selected) {
                    optDiv.classList.add("is-selected");
                }

                const titleSpan = document.createElement("span");
                titleSpan.className = "opt-title";
                titleSpan.textContent = opt.text;
                optDiv.appendChild(titleSpan);

                const checkSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
                checkSvg.setAttribute("class", "opt-check");
                checkSvg.setAttribute("width", "14");
                checkSvg.setAttribute("height", "14");
                checkSvg.setAttribute("viewBox", "0 0 24 24");
                checkSvg.setAttribute("fill", "none");
                checkSvg.setAttribute("stroke", "currentColor");
                checkSvg.setAttribute("stroke-width", "2.5");
                checkSvg.setAttribute("stroke-linecap", "round");
                checkSvg.setAttribute("stroke-linejoin", "round");
                checkSvg.innerHTML = '<polyline points="20 6 9 17 4 12"></polyline>';
                optDiv.appendChild(checkSvg);

                optDiv.addEventListener("click", function (e) {
                    e.stopPropagation();
                    const prevVal = selectElement.value;
                    selectElement.value = opt.value;
                    
                    menu.querySelectorAll(".custom-dropdown-option").forEach(function (el) {
                        el.classList.toggle("is-selected", el.dataset.value === opt.value);
                    });

                    updateTriggerText();
                    closeDropdown();

                    if (prevVal !== opt.value) {
                        selectElement.dispatchEvent(new Event("change", { bubbles: true }));
                    }
                });

                menu.appendChild(optDiv);
            });
            updateTriggerText();
        }

        function openDropdown() {
            document.querySelectorAll(".custom-dropdown-menu").forEach(function (m) {
                if (m !== menu) m.style.display = "none";
            });
            document.querySelectorAll(".custom-dropdown-trigger").forEach(function (t) {
                if (t !== trigger) {
                    t.classList.remove("is-active");
                    t.setAttribute("aria-expanded", "false");
                }
            });

            // Posicionamiento inteligente (evitar salirse de pantalla si está al fondo)
            const rect = trigger.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            if (spaceBelow < 220 && rect.top > 220) {
                menu.style.top = "auto";
                menu.style.bottom = "calc(100% + 5px)";
            } else {
                menu.style.bottom = "auto";
                menu.style.top = "calc(100% + 5px)";
            }

            menu.style.display = "block";
            trigger.classList.add("is-active");
            trigger.setAttribute("aria-expanded", "true");
        }

        function closeDropdown() {
            menu.style.display = "none";
            trigger.classList.remove("is-active");
            trigger.setAttribute("aria-expanded", "false");
        }

        trigger.addEventListener("click", function (e) {
            e.stopPropagation();
            if (menu.style.display === "block") {
                closeDropdown();
            } else {
                openDropdown();
            }
        });

        document.addEventListener("click", function (e) {
            if (!wrapper.contains(e.target)) {
                closeDropdown();
            }
        });

        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape" && menu.style.display === "block") {
                closeDropdown();
            }
        });

        selectElement.addEventListener("change", function () {
            updateTriggerText();
            menu.querySelectorAll(".custom-dropdown-option").forEach(function (el) {
                el.classList.toggle("is-selected", el.dataset.value === selectElement.value);
            });
        });

        populateMenu();
        wrapper.appendChild(trigger);
        wrapper.appendChild(menu);
        selectElement.parentNode.insertBefore(wrapper, selectElement.nextSibling);
    }

    function initAll() {
        const selects = document.querySelectorAll(
            ".recharge-service-select, .admin-assignment-select, .consumos-filter-form select, .admin-filter-field select, .admin-security-select, .admin-form-field select"
        );
        selects.forEach(function (s) {
            setupCustomDropdown(s);
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initAll);
    } else {
        initAll();
    }
})();
