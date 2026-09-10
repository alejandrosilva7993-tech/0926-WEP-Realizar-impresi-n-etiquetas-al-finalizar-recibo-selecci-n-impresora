/* Prototipo interactivo RF — impresión de etiquetas al finalizar recibo.
   Secuencia del capturador: filas confirmadas + captura Si (S) / No (N). */
(function () {
  "use strict";

  const els = {
    scenario: document.getElementById("scenarioSelect"),
    stepList: document.getElementById("stepList"),
    promptZone: document.getElementById("promptZone"),
    messageZone: document.getElementById("messageZone"),
    toast: document.getElementById("toast"),
    toastText: document.getElementById("toastText")
  };

  const scenarios = {
    boxesOnOperator: {
      label: "Cajas On · impresora del operador",
      receiptType: "Recibo sin orden",
      printingByBoxes: true,
      lpnConfig: true,
      printer: { mode: "operator", name: "RF-ZPL-03", detail: "Seleccionada por el operador" },
      products: [
        { sku: "12002", qty: 120, factor: 12, cajaMin: false, lot: "A2401", expiry: "12/2027", hasLot: true, hasCaja: true },
        { sku: "12002", qty: 48, factor: 12, cajaMin: false, lot: "B1188", expiry: "03/2028", hasLot: true, hasCaja: true },
        { sku: "88410", qty: 36, factor: 1, cajaMin: true, lot: null, expiry: null, hasLot: false, hasCaja: true }
      ]
    },
    boxesOffZone: {
      label: "Cajas Off · impresora de zona",
      receiptType: "Recibo simple",
      printingByBoxes: false,
      lpnConfig: true,
      printer: { mode: "zone", name: "ZN-REC-A-01", detail: "Zona Recibo A · workzone_printing encendido" },
      products: [
        { sku: "12002", qty: 96, factor: 12, cajaMin: false, lot: "A2401", expiry: "12/2027", hasLot: true, hasCaja: true }
      ]
    },
    incompleteBox: {
      label: "Caja incompleta (125 ÷ 12)",
      receiptType: "Recibo simple",
      printingByBoxes: true,
      lpnConfig: true,
      printer: { mode: "operator", name: "RF-ZPL-03", detail: "Seleccionada por el operador" },
      products: [
        { sku: "55120", qty: 125, factor: 12, cajaMin: false, lot: "S9921", expiry: "08/2026", hasLot: true, hasCaja: true }
      ]
    },
    noLpnConfig: {
      label: "Sin configuración de etiqueta LPN",
      receiptType: "Recibo sin orden",
      printingByBoxes: true,
      lpnConfig: false,
      printer: { mode: "operator", name: "RF-ZPL-03", detail: "Seleccionada por el operador" },
      products: [
        { sku: "12002", qty: 24, factor: 12, cajaMin: false, lot: "A2401", expiry: "12/2027", hasLot: true, hasCaja: true }
      ]
    },
    noCajaUom: {
      label: "Producto sin unidad Caja",
      receiptType: "Recibo sin orden",
      printingByBoxes: true,
      lpnConfig: true,
      printer: { mode: "operator", name: "RF-ZPL-03", detail: "Seleccionada por el operador" },
      products: [
        { sku: "77301", qty: 100, factor: 0, cajaMin: false, lot: null, expiry: null, hasLot: false, hasCaja: false }
      ]
    },
    pickPrinter: {
      label: "Seleccionar impresora en el momento",
      receiptType: "Recibo simple",
      printingByBoxes: true,
      lpnConfig: true,
      printer: { mode: "pick" },
      products: [
        { sku: "12002", qty: 144, factor: 12, cajaMin: false, lot: "A2401", expiry: "12/2027", hasLot: true, hasCaja: true }
      ]
    },
    noPrinter: {
      label: "Sin impresora disponible",
      receiptType: "Recibo sin orden",
      printingByBoxes: true,
      lpnConfig: true,
      printer: { mode: "unavailable" },
      products: [
        { sku: "12002", qty: 132, factor: 12, cajaMin: false, lot: "A2401", expiry: "12/2027", hasLot: true, hasCaja: true }
      ]
    }
  };

  const printers = [
    { id: "REC-ZPL-01", detail: "Recibo · Zebra ZT410 · Almacén CDMX" },
    { id: "REC-ZPL-02", detail: "Recibo · Zebra ZD421 · Muelle 3" },
    { id: "GEN-ZPL-05", detail: "General · Zebra ZT230 · Piso 1" }
  ];

  let state = null;

  function boxCount(product) {
    if (!product.hasCaja) return 0;
    if (product.cajaMin) return product.qty;
    const exact = product.qty / product.factor;
    const full = Math.floor(exact);
    return exact === full ? full : full + 1;
  }

  function baseRows(scenario, lpn) {
    return [
      { label: "Tipo de recibo", value: scenario.receiptType },
      { label: "Cuenta", value: "Cuenta principal" },
      { label: "Folio", value: "KAR123" },
      { label: "LPN", value: lpn }
    ];
  }

  function reset(scenarioKey, lpn) {
    const scenario = scenarios[scenarioKey];
    state = {
      scenarioKey: scenarioKey,
      lpn: lpn || "LPN0001",
      rows: baseRows(scenario, lpn || "LPN0001"),
      stage: "askPrint",
      message: null,
      generated: null,
      success: null,
      showLpnEsc: true,
      showLocationEsc: false,
      selectedPrinter: ""
    };
    window.clearTimeout(sendToPrinter.timer);
    els.toast.hidden = true;
    render();
  }

  function generate(scenario) {
    if (!scenario.lpnConfig) {
      return { total: 0, boxes: 0, blocked: true, missingCaja: [] };
    }

    const missingCaja = [];
    let boxes = 0;

    if (scenario.printingByBoxes) {
      scenario.products.forEach(function (p) {
        if (!p.hasCaja) {
          missingCaja.push(p.sku);
          return;
        }
        boxes += boxCount(p);
      });
    }

    return { total: 1 + boxes, boxes: boxes, blocked: false, missingCaja: missingCaja };
  }

  function answerPrint(value) {
    const scenario = scenarios[state.scenarioKey];

    if (value === "N") {
      state.rows.push({ label: "Imprimir etiquetas", value: "No" });
      goToLocation();
      return;
    }

    state.rows.push({ label: "Imprimir etiquetas", value: "Si" });
    state.showLpnEsc = false;
    const generated = generate(scenario);
    state.generated = generated;

    if (generated.blocked) {
      state.message = {
        tone: "is-error",
        pi: "pi-exclamation-triangle",
        html: '<span class="message-emphasis">No se generaron las etiquetas.</span> No existe configuración para etiqueta de tipo LPN.'
      };
      state.stage = "askLocation";
      render();
      return;
    }

    if (generated.missingCaja.length) {
      state.message = {
        tone: "is-warn",
        icon: "icon-warning.svg",
        html: '<span class="message-emphasis">No se generaron etiquetas de caja; solo la de tarima.</span> El producto no tiene configurada la unidad de medida &quot;Caja&quot; para su huella.'
      };
    }

    resolvePrinter(scenario, generated);
  }

  function resolvePrinter(scenario, generated) {
    const printer = scenario.printer;

    if (printer.mode === "operator" || printer.mode === "zone") {
      sendToPrinter(generated.total, printer.name);
      return;
    }

    if (printer.mode === "pick") {
      state.stage = "pickPrinter";
      state.message = null;
      render();
      return;
    }

    state.message = {
      tone: "is-error",
      icon: "icon-error.svg",
      html: '<span class="message-emphasis">No hay impresora disponible.</span> Ninguna opción de la jerarquía aplica; las ' + generated.total + " etiquetas quedan pendientes."
    };
    state.stage = "askLocation";
    render();
  }

  function cajaWarning(generated) {
    if (!generated.missingCaja.length) return null;
    return {
      tone: "is-warn",
      icon: "icon-warning.svg",
      html: '<span class="message-emphasis">No se generaron etiquetas de caja; solo la de tarima.</span> El producto no tiene configurada la unidad de medida &quot;Caja&quot; para su huella.'
    };
  }

  function sendToPrinter(total, printerName) {
    var unit = total === 1 ? " etiqueta" : " etiquetas";
    state.success = null;
    state.message = cajaWarning(state.generated) || null;
    state.stage = "printing";
    render();

    els.toastText.innerHTML = "<strong>" + total + unit + "</strong> en impresión · " + printerName;
    els.toast.hidden = false;
    window.clearTimeout(sendToPrinter.timer);
    sendToPrinter.timer = window.setTimeout(function () {
      els.toast.hidden = true;
      state.success = {
        tone: "is-done",
        pi: "pi-print",
        html: total === 1
          ? "<strong>1 etiqueta</strong> enviada a la impresora " + printerName + "."
          : "<strong>" + total + " etiquetas</strong> enviadas a la impresora " + printerName + "."
      };
      state.stage = "askLocation";
      render();
    }, 3800);
  }

  function goToLocation() {
    state.stage = "askLocation";
    render();
  }

  function rowHtml(row) {
    const toneClass = row.tone ? " is-" + row.tone : "";
    const icon = row.tone === "warn"
      ? "icon-warning.svg"
      : row.tone === "error"
        ? "icon-error.svg"
        : "icon-check-step.svg";
    const alt = row.tone === "warn" ? "Aviso" : row.tone === "error" ? "Error" : "Confirmado";
    const sub = row.sub ? '<span class="step-sub">' + row.sub + "</span>" : "";
    return (
      '<div class="step-row' + toneClass + '">' +
        '<p class="step-text">' + row.label + ": <strong>" + row.value + "</strong>" + sub + "</p>" +
        '<img class="step-check" src="' + icon + '" alt="' + alt + '">' +
      "</div>" +
      printSuccess(row) +
      escHint(row)
    );
  }

  function printSuccess(row) {
    if (row.label !== "Imprimir etiquetas" || !state.success) return "";
    return messageBlock(state.success);
  }

  function escHint(row) {
    if (row.label === "LPN" && state.showLpnEsc) {
      return '<p class="esc-hint">[Esc] Cambiar LPN</p>';
    }
    if (row.label === "Localidad destino" && state.showLocationEsc) {
      return '<p class="esc-hint">[Esc] Cambiar Localidad destino</p>';
    }
    return "";
  }

  function promptHtml(id, label) {
    return (
      '<div class="prompt-block">' +
        '<p class="prompt-label" id="' + id + 'Label">' + label + "</p>" +
        '<input class="control is-prompt" id="' + id + '" type="text" placeholder="Si (S) / No (N)" ' +
        'autocomplete="off" aria-labelledby="' + id + 'Label">' +
      "</div>"
    );
  }

  function printerPickerHtml() {
    var options = '<option value="">Seleccionar</option>' + printers.map(function (p) {
      var selected = p.id === state.selectedPrinter ? " selected" : "";
      return '<option value="' + p.id + '"' + selected + ">" + p.id + " · " + p.detail + "</option>";
    }).join("");
    var canPrint = !!state.selectedPrinter;
    return (
      '<div class="overlay" id="printerOverlay"></div>' +
      '<div class="modal" id="printerModal" role="dialog" aria-modal="true" aria-labelledby="printerModalTitle">' +
        '<div class="modal-head">' +
          '<h2 class="modal-title" id="printerModalTitle">Seleccionar impresora</h2>' +
          '<button class="modal-close" id="modalClose" type="button" aria-label="Cerrar">' +
            '<img src="icon-close.svg" alt="">' +
          "</button>" +
        "</div>" +
        '<p class="modal-copy">Para realizar la impresión de etiquetas, primero debes seleccionar una impresora</p>' +
        '<div class="field" style="margin:16px 0 0">' +
          '<label class="field-label" for="printerSelect">Seleccionar impresora<span class="required">*</span></label>' +
          '<div class="select-wrap">' +
            '<select class="control is-prompt" id="printerSelect">' + options + "</select>" +
          "</div>" +
        "</div>" +
        '<div class="modal-actions">' +
          '<button class="btn btn-green' + (canPrint ? "" : " is-disabled") + '" id="btnConfirmPrinter" type="button"' +
            (canPrint ? "" : " disabled") + ">Imprimir</button>" +
        "</div>" +
      "</div>"
    );
  }

  function modalHost() {
    var host = document.getElementById("modalHost");
    if (host) return host;
    host = document.createElement("div");
    host.id = "modalHost";
    document.querySelector(".device").appendChild(host);
    return host;
  }

  function clearModal() {
    var host = document.getElementById("modalHost");
    if (host) host.innerHTML = "";
  }

  function messageBlock(msg) {
    var icon = msg.pi
      ? '<i class="pi ' + msg.pi + ' message-icon" aria-hidden="true"></i>'
      : '<img class="message-icon" src="' + msg.icon + '" alt="">';
    return (
      '<section class="message ' + msg.tone + '" aria-live="polite">' +
        '<div class="message-head">' +
          icon +
          '<p class="message-title">' + msg.html + "</p>" +
        "</div>" +
      "</section>"
    );
  }

  function render() {
    els.stepList.innerHTML = state.rows.map(rowHtml).join("");

    els.messageZone.innerHTML = state.message ? messageBlock(state.message) : "";
    clearModal();

    if (state.stage === "askPrint") {
      els.promptZone.innerHTML = promptHtml("inputPrint", "¿Desea imprimir etiquetas?");
      bindPrompt("inputPrint", answerPrint);
    } else if (state.stage === "pickPrinter") {
      els.promptZone.innerHTML = "";
      modalHost().innerHTML = printerPickerHtml();
      bindPicker();
    } else if (state.stage === "printing") {
      els.promptZone.innerHTML = "";
    } else if (state.stage === "askLocation") {
      els.promptZone.innerHTML =
        '<div class="prompt-block">' +
          '<p class="prompt-label" id="inputLocationLabel">Localidad destino</p>' +
          '<input class="control is-prompt" id="inputLocation" type="text" ' +
          'value="" autocomplete="off" aria-labelledby="inputLocationLabel">' +
        "</div>";
      bindLocation();
    } else if (state.stage === "askLpnValue") {
      els.promptZone.innerHTML =
        '<div class="prompt-block">' +
          '<p class="prompt-label" id="inputLpnValueLabel">LPN</p>' +
          '<input class="control is-prompt" id="inputLpnValue" type="text" ' +
          'value="" autocomplete="off" aria-labelledby="inputLpnValueLabel">' +
        "</div>";
      bindValue("inputLpnValue", function (value) {
        state.lpn = value;
        state.rows.push({ label: "LPN", value: value });
        state.showLpnEsc = true;
        state.stage = "askPrint";
        render();
      });
    } else {
      /* Último paso del capturador: fuera del alcance de esta HU.
         Acepta la captura pero no continúa el flujo. */
      els.promptZone.innerHTML = promptHtml("inputLpn", "¿Desea agregar otro LPN?");
      bindPromptInert("inputLpn");
    }
  }

  function bindValue(id, handler) {
    const input = document.getElementById(id);
    input.addEventListener("keydown", function (event) {
      if (event.key !== "Enter") return;
      event.preventDefault();
      handler(input.value);
    });
    input.focus({ preventScroll: true });
  }

  function bindLocation() {
    bindValue("inputLocation", function (value) {
      state.rows.push({ label: "Localidad destino", value: value });
      state.showLocationEsc = true;
      state.stage = "askLpn";
      render();
    });
  }

  function bindPromptInert(id) {
    const input = document.getElementById(id);
    input.addEventListener("keydown", function (event) {
      var key = event.key.toUpperCase();
      if (key !== "S" && key !== "N") return;
      event.preventDefault();
      input.value = key === "S" ? "Si" : "No";
    });
    input.focus({ preventScroll: true });
  }

  function bindPrompt(id, handler) {
    const input = document.getElementById(id);
    var done = false;
    input.addEventListener("keydown", function (event) {
      var key = event.key.toUpperCase();
      if (key !== "S" && key !== "N") return;
      event.preventDefault();
      if (done) return;
      done = true;
      input.value = key === "S" ? "Si" : "No";
      handler(key);
    });
    input.focus({ preventScroll: true });
  }

  function bindPicker() {
    var select = document.getElementById("printerSelect");
    var confirm = document.getElementById("btnConfirmPrinter");
    var close = document.getElementById("modalClose");
    select.addEventListener("change", function () {
      state.selectedPrinter = select.value;
      confirm.disabled = !select.value;
      confirm.classList.toggle("is-disabled", !select.value);
    });
    confirm.addEventListener("click", function () {
      if (!state.selectedPrinter) return;
      clearModal();
      sendToPrinter(state.generated.total, state.selectedPrinter);
    });
    close.addEventListener("click", function () {
      clearModal();
      goToLocation();
    });
  }

  if (els.scenario) {
    Object.keys(scenarios).forEach(function (key) {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = scenarios[key].label;
      els.scenario.appendChild(opt);
    });

    els.scenario.addEventListener("change", function () {
      reset(els.scenario.value, "LPN0001");
    });
  }

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") return;
    if (state.stage === "pickPrinter") {
      event.preventDefault();
      clearModal();
      goToLocation();
      return;
    }
    if (state.showLocationEsc && state.stage === "askLpn") {
      event.preventDefault();
      state.rows = state.rows.filter(function (row) { return row.label !== "Localidad destino"; });
      state.showLocationEsc = false;
      goToLocation();
      return;
    }
    if (state.showLpnEsc && state.stage === "askPrint") {
      event.preventDefault();
      state.rows = state.rows.filter(function (row) { return row.label !== "LPN"; });
      state.stage = "askLpnValue";
      state.showLpnEsc = false;
      render();
    }
  });

  const device = document.querySelector(".device");
  const initialScenario = device && device.dataset.scenario
    ? device.dataset.scenario
    : "boxesOnOperator";
  reset(initialScenario, "LPN0001");
})();
