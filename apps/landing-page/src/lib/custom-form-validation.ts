const invalidControls = new WeakSet<HTMLElement>();
const errorMessages = new WeakMap<HTMLElement, HTMLElement>();

let isInstalled = false;

export function installCustomFormValidation() {
  if (isInstalled || typeof document === "undefined") {
    return;
  }

  isInstalled = true;

  enableCustomValidationForExistingForms();

  const observer = new MutationObserver(enableCustomValidationForExistingForms);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  document.addEventListener(
    "invalid",
    (event) => {
      event.preventDefault();
      const control = event.target;

      if (isFormControl(control)) {
        showFieldError(control);
      }
    },
    true,
  );

  document.addEventListener(
    "submit",
    (event) => {
      const form = event.target;

      if (!(form instanceof HTMLFormElement) || form.checkValidity()) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();

      const firstInvalidControl = Array.from(form.elements).find(
        (element): element is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement =>
          isFormControl(element) && !element.validity.valid,
      );

      if (firstInvalidControl) {
        showFieldError(firstInvalidControl);
        firstInvalidControl.focus({ preventScroll: true });
        firstInvalidControl.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    },
    true,
  );

  document.addEventListener(
    "input",
    (event) => {
      const control = event.target;

      if (isFormControl(control) && invalidControls.has(control)) {
        updateFieldError(control);
      }
    },
    true,
  );

  document.addEventListener(
    "change",
    (event) => {
      const control = event.target;

      if (isFormControl(control) && invalidControls.has(control)) {
        updateFieldError(control);
      }
    },
    true,
  );
}

function enableCustomValidationForExistingForms() {
  document.querySelectorAll("form").forEach((form) => {
    form.noValidate = true;
  });
}

function isFormControl(
  value: EventTarget | Element | null,
): value is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  return (
    value instanceof HTMLInputElement ||
    value instanceof HTMLSelectElement ||
    value instanceof HTMLTextAreaElement
  );
}

function updateFieldError(control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) {
  if (control.validity.valid) {
    clearFieldError(control);
    return;
  }

  showFieldError(control);
}

function showFieldError(control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) {
  invalidControls.add(control);
  control.classList.add("field-invalid");
  control.setAttribute("aria-invalid", "true");

  const message = getValidationMessage(control);
  const errorElement = getOrCreateErrorElement(control);
  errorElement.textContent = message;
}

function clearFieldError(control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) {
  invalidControls.delete(control);
  control.classList.remove("field-invalid");
  control.removeAttribute("aria-invalid");

  const errorElement = errorMessages.get(control);
  errorElement?.remove();
  errorMessages.delete(control);
}

function getOrCreateErrorElement(
  control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
) {
  const existingErrorElement = errorMessages.get(control);

  if (existingErrorElement?.isConnected) {
    return existingErrorElement;
  }

  const errorElement = document.createElement("p");
  errorElement.className = "field-error-message";

  const parentLabel = control.closest("label");
  const insertionTarget = parentLabel ?? control;
  insertionTarget.insertAdjacentElement("afterend", errorElement);
  errorMessages.set(control, errorElement);

  return errorElement;
}

function getValidationMessage(control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) {
  if (control.validity.valueMissing) {
    return control instanceof HTMLInputElement && control.type === "checkbox"
      ? "Potvrdite ovo polje za nastavak."
      : "Ovo polje je obavezno.";
  }

  if (control.validity.typeMismatch) {
    return control instanceof HTMLInputElement && control.type === "email"
      ? "Unesite ispravnu e-poštu."
      : "Provjerite format unosa.";
  }

  if (control.validity.tooShort) {
    return `Unesite barem ${control.getAttribute("minlength")} znakova.`;
  }

  if (control.validity.tooLong) {
    return `Unos može imati najviše ${control.getAttribute("maxlength")} znakova.`;
  }

  if (control.validity.rangeUnderflow || control.validity.rangeOverflow) {
    return "Unesite vrijednost unutar dopuštenog raspona.";
  }

  if (control.validity.patternMismatch) {
    return "Provjerite format unosa.";
  }

  if (control.validity.badInput) {
    return "Unesite ispravnu vrijednost.";
  }

  return "Provjerite ovo polje.";
}
