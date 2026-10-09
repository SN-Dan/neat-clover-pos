odoo.define('pos_neatclover.payment', function(require) {
"use strict";
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    function addCss() {
        const customModalStyles = `
            .neat-clover-modal-text {
                width: 380px;
                text-align: center;
            }
            .neat-clover-modal {
                display: inline-block;
                position: fixed;
                z-index: 1000;
                left: 0;
                top: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(0, 0, 0, 0.5);
            }

            .neat-clover-modal-content {
                background-color: #fff;
                border-radius: 5px;
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                padding: 20px;
                max-width: 560px;
                max-height: 90vh;
                overflow: auto;
                width: 92%;
            }

            /* Button styles */
            .neat-clover-modal-button {
                width: calc(100% - 20px);
                height: 55px;
                margin: 5px;
                cursor: pointer;
                font-size: 22px;
                border: none;
                background: darkseagreen;
                color: white;
            }
            .neat-clover-modal-button.secondary {
                background: #6c757d;
            }
            .neat-clover-modal-button.danger {
                background: #dc3545;
                height: 40px;
                font-size: 16px;
                width: auto;
                padding: 0 12px;
            }
            .neat-clover-modal-input {
                width: calc(100% - 20px);
                height: 45px;
                margin: 5px;
                padding: 10px;
                font-size: 18px;
                border: 1px solid #ccc;
                border-radius: 4px;
                box-sizing: border-box;
            }
            .neat-clover-preauth-list {
                text-align: left;
                margin: 10px 5px 0;
                font-size: 14px;
            }
            .neat-clover-preauth-item {
                border: 1px solid #dee2e6;
                border-radius: 4px;
                padding: 10px;
                margin-bottom: 8px;
            }
            .neat-clover-preauth-item strong {
                display: block;
                margin-bottom: 4px;
            }
            /* Pre-auth modal only: keep controls within viewport width */
            .neat-clover-preauth-modal .neat-clover-modal-text {
                width: auto;
                max-width: 100%;
            }
            .neat-clover-preauth-modal .neat-clover-modal-input,
            .neat-clover-preauth-modal .neat-clover-modal-button:not(.danger) {
                width: 100%;
                max-width: 100%;
                margin-left: 0;
                margin-right: 0;
                box-sizing: border-box;
            }
            .neat-clover-preauth-modal .neat-clover-preauth-list,
            .neat-clover-preauth-modal .neat-clover-preauth-item {
                max-width: 100%;
                box-sizing: border-box;
            }
            .neat-clover-preauth-modal .neat-clover-dropdown {
                position: relative;
                width: 100%;
                margin: 5px 0;
                box-sizing: border-box;
            }
            .neat-clover-preauth-modal .neat-clover-dd-toggle {
                text-align: left;
                background: #fff;
                color: #111;
                cursor: pointer;
                appearance: none;
                -webkit-appearance: none;
            }
            .neat-clover-preauth-modal .neat-clover-dd-toggle::after {
                content: "▼";
                float: right;
                font-size: 12px;
                opacity: 0.7;
            }
            .neat-clover-preauth-modal .neat-clover-dd-menu {
                display: none;
                width: 100%;
                margin-top: 4px;
                background: #fff;
                border: 1px solid #ccc;
                border-radius: 4px;
                max-height: 220px;
                overflow-y: auto;
                box-sizing: border-box;
                -webkit-overflow-scrolling: touch;
            }
            .neat-clover-preauth-modal .neat-clover-dd-menu.is-open {
                display: block;
            }
            .neat-clover-preauth-modal .neat-clover-dd-option {
                display: block;
                width: 100%;
                text-align: left;
                padding: 14px 10px;
                border: none;
                border-bottom: 1px solid #eee;
                background: #fff;
                font-size: 16px;
                cursor: pointer;
                box-sizing: border-box;
            }
            .neat-clover-preauth-modal .neat-clover-dd-option:last-child {
                border-bottom: none;
            }
            .neat-clover-preauth-modal .neat-clover-dd-option:active {
                background: #e9ecef;
            }
        `;

        const styleElement = document.createElement('style');
        styleElement.innerHTML = customModalStyles;
        document.head.appendChild(styleElement);
    }
    async function displaySyncModal() {
        if (document.querySelector('.neat-clover-modal')) {
            return;
        }
        const modal = document.createElement('div');
        modal.classList.add('neat-clover-modal');
        const currentCode = localStorage.getItem('neat_synced_device_code') || '';
        modal.innerHTML = `
            <div class="neat-clover-modal-content">
                <h2 class="neat-clover-modal-text">Select the terminal device code to sync.</h2>
                <div>
                    <select id="deviceCodeInput" class="neat-clover-modal-input">
                        <option value="">Loading...</option>
                    </select>
                    <button class="neat-clover-modal-button" id="btnSync">Sync</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        modal.addEventListener('keydown', function(e) { e.stopPropagation(); });
        modal.addEventListener('keyup', function(e) { e.stopPropagation(); });
        modal.addEventListener('keypress', function(e) { e.stopPropagation(); });

        function closeModal() {
            document.body.removeChild(modal);
        }

        const select = document.getElementById('deviceCodeInput');
        let devices = [];
        try {
            const rpcService = require('web.rpc');
            const result = await rpcService.query({
                route: '/pos_clover/device_codes',
                params: {},
            });
            if (result && result.status === 200 && result.data) {
                devices = result.data;
            }
        } catch (e) {
            console.error('Failed to load Clover device codes', e);
        }

        select.innerHTML = '<option value="">Select device code</option>';
        for (const d of devices) {
            const opt = document.createElement('option');
            opt.value = d.device_code;
            opt.textContent = d.name ? (d.device_code + ' (' + d.name + ')') : d.device_code;
            if (d.device_code === currentCode) {
                opt.selected = true;
            }
            select.appendChild(opt);
        }

        var btn = document.getElementById("btnSync")
        btn.addEventListener("click", function(e) {
            const deviceCode = select.value;
            if (!deviceCode) {
                alert('Please select a device code.');
                return;
            }
            localStorage.setItem('neat_synced_device_code', deviceCode)
            closeModal();
            socket_connect(true)
        });
    }
    window.displaySyncModal = displaySyncModal;
    function type_on_keyboard(inputString) {
        const barcodeInput = document.querySelector('body .o-barcode-input');
        console.log(barcodeInput);

        for (let i = 0; i < inputString.length; i++) {
            const char = inputString.charAt(i);
            const event = new KeyboardEvent('keydown', {
                key: char,
                bubbles: true,
                cancelable: true
            });
            console.log(char);
            document.body.dispatchEvent(event);
        }
    }


    var NEAT_CLOVER_ONLINE_WS_URL = "wss://bqhdar6mj1.execute-api.eu-central-1.amazonaws.com/prod";
    var NEAT_CLOVER_WS_TOKEN_REFRESH_SKEW = 300;

    function neatCloverDesktopWsSend(msgType, payload) {
        if (!window.desktop_ws || window.desktop_ws.readyState !== WebSocket.OPEN) {
            return;
        }
        window.desktop_ws.send(JSON.stringify({ type: "message", msgType: msgType, msgPayload: payload }));
    }
    window.desktop_ws_send_message = neatCloverDesktopWsSend;

    async function neatCloverEnsureDesktopAccessToken(rpcCall, paymentMethodId) {
        const now = Math.floor(Date.now() / 1000);
        const cached = window._neat_desktop_ws_token;
        if (cached && cached.accessToken && cached.expiresAt && (cached.expiresAt - now) > NEAT_CLOVER_WS_TOKEN_REFRESH_SKEW) {
            return cached.accessToken;
        }
        const deviceCode = localStorage.getItem("neat_synced_device_code");
        if (!deviceCode || !rpcCall) {
            return null;
        }
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const result = await rpcCall("/pos_clover/desktop_ws/token", {
                    device_code: deviceCode,
                    payment_method_id: paymentMethodId || false,
                });
                if (result && result.status === 200 && result.accessToken && result.expiresAt) {
                    window._neat_desktop_ws_token = {
                        accessToken: result.accessToken,
                        expiresAt: result.expiresAt,
                    };
                    return result.accessToken;
                }
            } catch (e) {
                console.error("Desktop WS token mint failed", e);
            }
        }
        return null;
    }

    window.is_printing_allowed_desktop_ws_map = {}
    async function socket_connect(initialConnect = false) {
        if(!window.desktop_ws || !initialConnect) {
            if (window.desktop_ws_is_online) {
                const token = await neatCloverEnsureDesktopAccessToken(
                    window.desktop_ws_token_rpc,
                    window.desktop_ws_payment_method_id,
                );
                if (!token) {
                    setTimeout(function() {
                        socket_connect(initialConnect);
                    }, 1000);
                    return;
                }
                window.desktop_ws_url = NEAT_CLOVER_ONLINE_WS_URL + '?accessToken=' + encodeURIComponent(token);
            }
            window.desktop_ws = new WebSocket(window.desktop_ws_url)
            window.desktop_ws.onopen = () => {
                const syncedDeviceCode = localStorage.getItem("neat_synced_device_code")
                window.desktop_ws.send(JSON.stringify({ type: "register", deviceId: syncedDeviceCode + "-pc" }));
                console.log("Connected and registered.");
            }
            window.desktop_ws.onmessage = (event) => {
                const msg = JSON.parse(event.data);
                if(msg.msgType === 'barcode') {
                    type_on_keyboard(msg.msgPayload)
                }
                if (msg.msgId) {
                    window.desktop_ws.send(JSON.stringify({ type: "ack", msgId: msg.msgId }));
                }
            }
            window.desktop_ws.onerror = () => {
                window.desktop_ws.close()
                console.log("Disconnected, retrying...");
            }
            window.desktop_ws.onclose = () => {
                console.log("Disconnected, retrying...");
                setTimeout(socket_connect, 1000);
            }
        }
    }

    addCss()
    const rpc = require('web.rpc');
    const PaymentInterface = require('point_of_sale.PaymentInterface');

    function neatCloverRpc(route, params) {
        return rpc.query({
            route: route,
            params: params || {},
        });
    }

    function getNeatCloverPaymentMethods(pos) {
        const methods = (pos && pos.payment_methods) || [];
        return methods.filter(function (pm) {
            return pm.use_payment_terminal === 'neatclover';
        });
    }

    function neatCloverOrderUserId(order) {
        if (!order) {
            return false;
        }
        if (order.cashier) {
            return order.cashier.id;
        }
        if (order.employee && order.employee.user_id) {
            return order.employee.user_id[0];
        }
        return false;
    }

    function wakeNeatCloverTerminal(paymentMethod) {
        if (!paymentMethod) {
            return;
        }
        const device = window.navigator.userAgent;
        const isMobile = device.includes("Android") || window.isNeatPOSAndroidApp;
        if (paymentMethod.neat_clover_is_mobile && isMobile) {
            if (window.isNeatPOSAndroidApp) {
                AndroidInterface.onPayment("btnPayPal");
            } else {
                var currentURL = window.location.href;
                var encodedURL = encodeURIComponent(currentURL);
                window.open("app://neat-clover-payment-android?paymentType=0&redirectUrl=" + encodedURL);
            }
        } else if (
            paymentMethod.neat_clover_is_desktop_mode &&
            !isMobile &&
            paymentMethod.neat_clover_terminal_device_code === localStorage.getItem("neat_synced_device_code") &&
            (
                (paymentMethod.neat_clover_is_local_ws_server && paymentMethod.neat_clover_ws_url) ||
                !paymentMethod.neat_clover_is_local_ws_server
            )
        ) {
            (window.desktop_ws_send_message || neatCloverDesktopWsSend)("payment", "");
        }
    }

    const PaymentTerminal = PaymentInterface.extend({
        init: function () {
            this._super.apply(this, arguments);
            const self = this;
            window.displayPreAuthModal = function () {
                return self.displayPreAuthModal();
            };
            const device = window.navigator.userAgent
            const isMobile = device.includes("Android") || window.isNeatPOSAndroidApp
            
            if(this.payment_method.neat_clover_is_desktop_mode && !isMobile){
                window.is_printing_allowed_desktop_ws_map[this.payment_method.neat_clover_terminal_device_code] = this.payment_method.neat_clover_is_terminal_printer_communication_allowed
                var wsUrl = false
                var isOnlineDesktop = false
                if (this.payment_method.neat_clover_is_local_ws_server && this.payment_method.neat_clover_ws_url) {
                    wsUrl = this.payment_method.neat_clover_ws_url
                    isOnlineDesktop = false
                } else if (!this.payment_method.neat_clover_is_local_ws_server) {
                    wsUrl = NEAT_CLOVER_ONLINE_WS_URL
                    isOnlineDesktop = true
                }
                var syncedDeviceCode = localStorage.getItem("neat_synced_device_code");
                var pmDeviceCode = this.payment_method.neat_clover_terminal_device_code;
                if(wsUrl && (!syncedDeviceCode || syncedDeviceCode === pmDeviceCode)) {
                    window.desktop_ws_url = wsUrl
                    window.desktop_ws_is_online = isOnlineDesktop
                    window.desktop_ws_payment_method_id = this.payment_method.id
                    window.desktop_ws_token_rpc = function(route, params) {
                        return rpc.query({
                            route: route,
                            params: params,
                        });
                    };
                    window.desktop_ws_send_message = neatCloverDesktopWsSend
                    window.desktop_ws_upload_print = async function(image) {
                        try {
                            const result = await rpc.query({
                                route: '/pos_clover/desktop_print/upload',
                                params: { image: image },
                            });
                            if (result && result.status === 200 && result.data && result.data.print_id) {
                                return result.data.print_id;
                            }
                        } catch (e) {
                            console.error('Desktop print upload failed', e);
                        }
                        return false;
                    };
                    window.desktop_ws_send_print = async function(image) {
                        if (window.desktop_ws_is_online && window.desktop_ws_upload_print) {
                            const printId = await window.desktop_ws_upload_print(image);
                            if (printId) {
                                const payload = JSON.stringify({ print_id: printId });
                                (window.desktop_ws_send_message || neatCloverDesktopWsSend)("print_cloud", payload);
                                return true;
                            }
                            return false;
                        }
                        if (window.desktop_ws_send_message) {
                            window.desktop_ws_send_message("print", image);
                        } else if (window.desktop_ws) {
                            window.desktop_ws.send(JSON.stringify({ type: "message", msgType: "print", msgPayload: image }));
                        }
                        return true;
                    };
                    if(syncedDeviceCode === pmDeviceCode) {
                        socket_connect(true)
                    }
                    else {
                        displaySyncModal()
                    }
                }
            }
        },
        _getNeatCloverPaymentMethods: function () {
            return getNeatCloverPaymentMethods(this.pos);
        },
        _waitNeatCloverRequest: async function (terminalId, transactionId, successStatuses) {
            while (true) {
                try {
                    const res = await neatCloverRpc('/pos_clover/check_request', {
                        terminal_id: terminalId,
                        transaction_id: transactionId,
                    });
                    if (res && res.status === 200) {
                        if (successStatuses.indexOf(res.data.status) !== -1) {
                            const processed = await neatCloverRpc('/pos_clover/request_processed', {
                                terminal_id: terminalId,
                                transaction_id: res.data.transaction_id,
                            });
                            return !!(processed && processed.status === 200);
                        }
                        if (res.data.status !== 'pending') {
                            return false;
                        }
                    } else {
                        return false;
                    }
                } catch (e) {
                    // keep polling
                }
                await sleep(2000);
            }
        },
        _choosePreauthOrSale: async function (terminalId, requestedAmount) {
            // POS pre-auths are terminal-scoped (not customer-scoped).
            const listRes = await neatCloverRpc('/pos_clover/list_open_preauths', {
                terminal_id: terminalId,
            });
            const preauths = (listRes && listRes.status === 200 && listRes.data && listRes.data.preauths) || [];
            if (!preauths.length) {
                return { mode: 'sale' };
            }
            if (document.querySelector('.neat-clover-modal')) {
                return { mode: 'cancel' };
            }
            return await new Promise((resolve) => {
                const modal = document.createElement('div');
                modal.classList.add('neat-clover-modal');
                const optionsHtml = preauths.map(function (p) {
                    return `
                <div class="neat-clover-preauth-item">
                    <label style="display:flex;gap:8px;align-items:flex-start;cursor:pointer;">
                        <input type="radio" name="neatPreauthChoice" value="${p.transaction_id}" style="margin-top:4px;"/>
                        <span>
                            <strong>${p.preauth_label}</strong>
                            Terminal: ${p.terminal_id}<br/>
                            Auth: ${p.amount.toFixed(2)} | Charged: ${p.captured_amount.toFixed(2)} | Remaining: ${p.remaining_amount.toFixed(2)}<br/>
                            Ref: ${p.transaction_id}
                        </span>
                    </label>
                </div>
            `;
                }).join('');
                modal.innerHTML = `
                <div class="neat-clover-modal-content">
                    <h2 class="neat-clover-modal-text">Use a pre-authorization or take a normal payment?</h2>
                    <p class="neat-clover-modal-text" style="font-size:14px;">Requested amount: ${Number(requestedAmount).toFixed(2)}</p>
                    <div class="neat-clover-preauth-list">
                        <div class="neat-clover-preauth-item">
                            <label style="display:flex;gap:8px;align-items:flex-start;cursor:pointer;">
                                <input type="radio" name="neatPreauthChoice" value="__sale__" checked style="margin-top:4px;"/>
                                <span><strong>Normal payment</strong><br/>Do not use a pre-authorization.</span>
                            </label>
                        </div>
                        ${optionsHtml}
                    </div>
                    <button class="neat-clover-modal-button" id="btnNeatPreauthContinue">Continue</button>
                    <button class="neat-clover-modal-button secondary" id="btnNeatPreauthCancel">Cancel</button>
                </div>
            `;
                document.body.appendChild(modal);
                const close = function () {
                    if (modal.parentNode) {
                        document.body.removeChild(modal);
                    }
                };
                document.getElementById('btnNeatPreauthCancel').onclick = function () {
                    close();
                    resolve({ mode: 'cancel' });
                };
                document.getElementById('btnNeatPreauthContinue').onclick = function () {
                    const selected = modal.querySelector('input[name="neatPreauthChoice"]:checked');
                    const value = selected ? selected.value : '__sale__';
                    close();
                    if (value === '__sale__') {
                        resolve({ mode: 'sale' });
                    } else {
                        const preauth = preauths.find(function (p) {
                            return p.transaction_id === value;
                        });
                        resolve({ mode: 'capture', preauth: preauth });
                    }
                };
            });
        },
        displayPreAuthModal: async function () {
            if (document.querySelector('.neat-clover-modal')) {
                return;
            }
            const methods = this._getNeatCloverPaymentMethods();
            if (!methods.length) {
                alert('No Clover terminals are configured on this POS.');
                return;
            }
            const order = this.pos.get_order();
            const baseLabel = (order && (order.name || order.uid || '')) || '';
            let suggested = baseLabel;
            try {
                const suggestRes = await neatCloverRpc('/pos_clover/suggest_preauth_label', {
                    base_label: baseLabel,
                });
                if (suggestRes && suggestRes.status === 200 && suggestRes.data) {
                    suggested = suggestRes.data.preauth_label || baseLabel;
                }
            } catch (e) {
                console.error(e);
            }

            const modal = document.createElement('div');
            modal.classList.add('neat-clover-modal', 'neat-clover-preauth-modal');
            const firstPm = methods[0];
            const firstCode = (firstPm && firstPm.neat_clover_terminal_device_code) || '';
            const firstLabel = firstPm
                ? ((firstPm.name || firstCode) + ' (' + firstCode + ')')
                : 'Select terminal';
            const menuItems = methods.map(function (pm) {
                const code = pm.neat_clover_terminal_device_code || '';
                const name = pm.name || code;
                return '<button type="button" class="neat-clover-dd-option" data-value="' + code + '">' + name + ' (' + code + ')</button>';
            }).join('');
            modal.innerHTML = `
            <div class="neat-clover-modal-content">
                <h2 class="neat-clover-modal-text">Clover Pre-Authorization</h2>
                <div class="neat-clover-dropdown" id="neatPreauthTerminalWrap">
                    <button type="button" class="neat-clover-modal-input neat-clover-dd-toggle" id="neatPreauthTerminalToggle">${firstLabel}</button>
                    <input type="hidden" id="neatPreauthTerminal" value="${firstCode}"/>
                    <div class="neat-clover-dd-menu" id="neatPreauthTerminalMenu">${menuItems}</div>
                </div>
                <input id="neatPreauthAmount" class="neat-clover-modal-input" type="number" min="0.01" step="0.01" placeholder="Amount"/>
                <input id="neatPreauthLabel" class="neat-clover-modal-input" type="text" placeholder="Reference / name" value="${suggested.replace(/"/g, '&quot;')}"/>
                <button class="neat-clover-modal-button" id="btnNeatCreatePreauth">Pre-Authorize</button>
                <div class="neat-clover-preauth-list" id="neatPreauthList"><em>Loading active pre-auths...</em></div>
                <button class="neat-clover-modal-button secondary" id="btnNeatPreauthClose">Close</button>
            </div>
        `;
            document.body.appendChild(modal);
            modal.addEventListener('keydown', function (e) { e.stopPropagation(); });
            modal.addEventListener('keyup', function (e) { e.stopPropagation(); });
            modal.addEventListener('keypress', function (e) { e.stopPropagation(); });

            const closeModal = function () {
                if (modal.parentNode) {
                    document.body.removeChild(modal);
                }
            };
            const terminalInput = document.getElementById('neatPreauthTerminal');
            const terminalToggle = document.getElementById('neatPreauthTerminalToggle');
            const terminalMenu = document.getElementById('neatPreauthTerminalMenu');
            const getSelectedTerminalId = function () {
                return terminalInput.value || '';
            };
            const listEl = document.getElementById('neatPreauthList');
            const self = this;

            const refreshList = async function () {
                const terminalId = getSelectedTerminalId();
                listEl.innerHTML = '<em>Loading...</em>';
                try {
                    const res = await neatCloverRpc('/pos_clover/list_open_preauths', {
                        terminal_id: terminalId,
                    });
                    const preauths = (res && res.status === 200 && res.data && res.data.preauths) || [];
                    if (!preauths.length) {
                        listEl.innerHTML = '<em>No active pre-authorizations for this terminal.</em>';
                        return;
                    }
                    listEl.innerHTML = preauths.map(function (p) {
                        return `
                    <div class="neat-clover-preauth-item" data-txid="${p.transaction_id}">
                        <strong>${p.preauth_label}</strong>
                        Terminal: ${p.terminal_id}<br/>
                        Auth: ${p.amount.toFixed(2)} | Charged: ${p.captured_amount.toFixed(2)} | Remaining: ${p.remaining_amount.toFixed(2)}<br/>
                        Ref: ${p.transaction_id}
                        <div style="margin-top:8px;">
                            <button class="neat-clover-modal-button danger neat-void-preauth" data-txid="${p.transaction_id}">Void</button>
                            <button class="neat-clover-modal-button secondary neat-delete-preauth" data-txid="${p.transaction_id}" style="width:auto;height:40px;font-size:16px;padding:0 12px;">Delete</button>
                        </div>
                    </div>
                `;
                    }).join('');
                    listEl.querySelectorAll('.neat-void-preauth').forEach(function (btn) {
                        btn.addEventListener('click', async function () {
                            const txid = btn.getAttribute('data-txid');
                            const preauth = preauths.find(function (p) {
                                return p.transaction_id === txid;
                            });
                            if (!preauth) {
                                return;
                            }
                            btn.disabled = true;
                            btn.textContent = 'Voiding...';
                            const paymentMethod = methods.find(function (pm) {
                                return pm.neat_clover_terminal_device_code === getSelectedTerminalId();
                            });
                            const orderObj = self.pos.get_order();
                            const voidParams = {
                                terminal_id: getSelectedTerminalId(),
                                order_id: (orderObj && (orderObj.name || orderObj.uid)) || 'pos-preauth',
                                amount: preauth.remaining_amount,
                                user_id: neatCloverOrderUserId(orderObj),
                                request_type: 'void_preauth',
                                parent_transaction_id: txid,
                            };
                            const result = await neatCloverRpc('/pos_clover/create_payment_request', voidParams);
                            if (!result || result.status !== 201) {
                                alert('Could not start void.');
                                await refreshList();
                                return;
                            }
                            wakeNeatCloverTerminal(paymentMethod);
                            const ok = await self._waitNeatCloverRequest(
                                getSelectedTerminalId(),
                                result.data.transaction_id,
                                ['voided', 'done']
                            );
                            if (!ok) {
                                alert('Void failed or was cancelled.');
                            }
                            await refreshList();
                        });
                    });

                    listEl.querySelectorAll('.neat-delete-preauth').forEach(function (btn) {
                        btn.addEventListener('click', async function () {
                            const txid = btn.getAttribute('data-txid');
                            if (!txid) {
                                return;
                            }
                            if (!confirm('Delete this pre-authorization from Odoo without voiding it on the Clover terminal?')) {
                                return;
                            }
                            btn.disabled = true;
                            btn.textContent = 'Deleting...';
                            try {
                                const result = await neatCloverRpc('/pos_clover/delete_preauth', {
                                    terminal_id: getSelectedTerminalId(),
                                    transaction_id: txid,
                                });
                                if (!result || result.status !== 200) {
                                    alert('Could not delete pre-authorization.');
                                }
                            } catch (e) {
                                console.error(e);
                                alert('Could not delete pre-authorization.');
                            }
                            await refreshList();
                        });
                    });
                } catch (e) {
                    console.error(e);
                    listEl.innerHTML = '<em>Failed to load pre-authorizations.</em>';
                }
            };

            terminalToggle.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                terminalMenu.classList.toggle('is-open');
            });
            terminalMenu.querySelectorAll('.neat-clover-dd-option').forEach(function (btn) {
                btn.addEventListener('click', function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    terminalInput.value = btn.getAttribute('data-value') || '';
                    terminalToggle.textContent = btn.textContent;
                    terminalMenu.classList.remove('is-open');
                    refreshList();
                });
            });
            modal.addEventListener('click', function (e) {
                if (!e.target.closest || !e.target.closest('#neatPreauthTerminalWrap')) {
                    terminalMenu.classList.remove('is-open');
                }
            });

            document.getElementById('btnNeatPreauthClose').onclick = closeModal;
            document.getElementById('btnNeatCreatePreauth').onclick = async function () {
                const terminalId = getSelectedTerminalId();
                const amount = parseFloat(document.getElementById('neatPreauthAmount').value);
                const label = (document.getElementById('neatPreauthLabel').value || '').trim();
                if (!terminalId) {
                    alert('Please select a terminal.');
                    return;
                }
                if (!(amount > 0)) {
                    alert('Please enter a valid amount.');
                    return;
                }
                if (!label) {
                    alert('Pre-Auth Reference is required.');
                    return;
                }
                const paymentMethod = methods.find(function (pm) {
                    return pm.neat_clover_terminal_device_code === terminalId;
                });
                const orderObj = self.pos.get_order();
                const btn = document.getElementById('btnNeatCreatePreauth');
                btn.disabled = true;
                btn.textContent = 'Processing...';
                try {
                    const createParams = {
                        terminal_id: terminalId,
                        order_id: (orderObj && (orderObj.name || orderObj.uid)) || 'pos-preauth',
                        amount: amount,
                        user_id: neatCloverOrderUserId(orderObj),
                        request_type: 'preauth',
                        preauth_label: label,
                    };
                    const result = await neatCloverRpc('/pos_clover/create_payment_request', createParams);
                    if (!result || result.status !== 201) {
                        if (result && result.error === 'preauth_label_taken') {
                            alert('That Pre-Auth Reference is already in use.');
                        } else {
                            alert('Could not create pre-authorization.');
                        }
                        btn.disabled = false;
                        btn.textContent = 'Pre-Authorize';
                        return;
                    }
                    wakeNeatCloverTerminal(paymentMethod);
                    const ok = await self._waitNeatCloverRequest(
                        terminalId,
                        result.data.transaction_id,
                        ['authorized', 'done']
                    );
                    if (!ok) {
                        alert('Pre-authorization failed or was cancelled.');
                    }
                    const amountInput = document.getElementById('neatPreauthAmount');
                    if (amountInput) {
                        amountInput.value = '';
                    }
                    const suggestRes = await neatCloverRpc('/pos_clover/suggest_preauth_label', {
                        base_label: baseLabel,
                    });
                    const labelInput = document.getElementById('neatPreauthLabel');
                    if (labelInput && suggestRes && suggestRes.status === 200 && suggestRes.data) {
                        labelInput.value = suggestRes.data.preauth_label || '';
                    }
                    if (document.getElementById('neatPreauthList')) {
                        await refreshList();
                    }
                } catch (e) {
                    console.error(e);
                    alert('Could not create pre-authorization.');
                }
                if (btn.isConnected) {
                    btn.disabled = false;
                    btn.textContent = 'Pre-Authorize';
                }
            };
            await refreshList();
        },
        send_payment_request: async function(cid) {
            const line = this.pos.get_order().selected_paymentline;
            try {
                await this._super.apply(this, arguments);
                const order = this.pos.get_order();
                const data = this._terminal_pay_data();
                const terminalId = data.PaymentMethod.neat_clover_terminal_device_code
                const refunded_order_line_ids = []

                for(let i = 0; i < order.orderlines.length; i++) {
                    var orderline = null
                    if(Array.isArray(order.orderlines)) {
                        orderline = order.orderlines[i]
                    }
                    else {
                        orderline = order.orderlines.models[i]
                    }

                    if(orderline.refunded_orderline_id) {
                        refunded_order_line_ids.push(orderline.refunded_orderline_id)
                    }
                }

                if(refunded_order_line_ids.length > 1) {
                    const iosr = await neatCloverRpc('/pos_clover/is_order_the_same', {
                        refunded_order_line_ids
                    })

                    if(!iosr || !iosr.data || !iosr.data.is_order_the_same) {
                        line.set_payment_status('retry');
                        throw new Error('Cannot have multiple refunds in an order.');
                    }
                }

                var refunded_order_line_id = undefined
                if(refunded_order_line_ids.length) {
                    refunded_order_line_id = refunded_order_line_ids[0]
                }

                var user_id = neatCloverOrderUserId(order)

                let requestType = 'sale';
                let parentTransactionId = undefined;
                let requestAmount = data.RequestedAmount;

                if (!refunded_order_line_id && requestAmount > 0) {
                    const choice = await this._choosePreauthOrSale(terminalId, requestAmount);
                    if (!choice || choice.mode === 'cancel') {
                        line.set_payment_status('retry');
                        return false;
                    }
                    if (choice.mode === 'capture' && choice.preauth) {
                        requestType = 'capture';
                        parentTransactionId = choice.preauth.transaction_id;
                        if (requestAmount > choice.preauth.remaining_amount) {
                            requestAmount = choice.preauth.remaining_amount;
                        }
                    }
                }

                const params = {
                    terminal_id: terminalId,
                    order_id: data.OrderID,
                    amount: requestAmount,
                    user_id: user_id,
                    refunded_order_line_id,
                    request_type: requestType,
                    parent_transaction_id: parentTransactionId,
                }

                const result = await neatCloverRpc('/pos_clover/create_payment_request', params)
                if(!result || result.status === 403 || result.status === 400 || result.status === 409 || result.status === 404) {
                    line.set_payment_status('retry');
                    return false
                }
                if (result.data && typeof result.data.amount === 'number' && result.data.amount > 0) {
                    requestAmount = result.data.amount;
                }
                const device = window.navigator.userAgent
                const isMobile = device.includes("Android") || window.isNeatPOSAndroidApp
                if(result && result.status === 201 && data.PaymentMethod.neat_clover_is_mobile && isMobile) {
                    if(window.isNeatPOSAndroidApp) {
                        AndroidInterface.onPayment("btnPayPal")
                    }
                    else {
                        var currentURL = window.location.href;
                        var encodedURL = encodeURIComponent(currentURL);
                        window.open("app://neat-clover-payment-android?paymentType=0&redirectUrl=" + encodedURL);
                    }
                }
                else if(result && result.status === 201 && data.PaymentMethod.neat_clover_is_desktop_mode && !isMobile && data.PaymentMethod.neat_clover_terminal_device_code === localStorage.getItem("neat_synced_device_code") && (
                    (data.PaymentMethod.neat_clover_is_local_ws_server && data.PaymentMethod.neat_clover_ws_url)
                    || !data.PaymentMethod.neat_clover_is_local_ws_server
                    )) {
                    (window.desktop_ws_send_message || neatCloverDesktopWsSend)("payment", "");
                }
                line.set_payment_status('waitingCard');
                while(true) {
                    try {
                        const res = await neatCloverRpc('/pos_clover/check_request', {
                            terminal_id: terminalId,
                            transaction_id: result.data.transaction_id,
                        })

                        if(res && res.status === 200) {
                            if(res.data.status === 'done' || res.data.status === 'refunded' || res.data.status === 'resent_done' || res.data.status === 'resent_refunded') {
                                const processed_result = await neatCloverRpc('/pos_clover/request_processed', {
                                    terminal_id: terminalId,
                                    transaction_id: res.data.transaction_id,
                                })
                                if(processed_result && processed_result.status == 200) {
                                    try {
                                        line.transaction_id = res.data.transaction_id;
                                        line.card_type = res.data.card_type;
                                        line.cardholder_name = res.data.cardholder_name
                                        if(res.data.is_refund && line.amount !== res.data.refunded_amount) {
                                            if(res.data.refunded_amount < 0) {
                                                line.amount = res.data.refunded_amount
                                            }
                                            else {
                                                line.amount = -1 * res.data.refunded_amount
                                            }
                                        }
                                        else {
                                            line.amount = res.data.transaction_amount
                                        }
                                        line.set_payment_status('done');
                                        return true
                                    }
                                    catch(e) {
                                        console.log(e)
                                        await neatCloverRpc('/pos_clover/log_message_ui', {
                                            terminal_id: terminalId,
                                            transaction_id: res.data.transaction_id,
                                            type: 'error',
                                            message: 'Error setting payment status: ' + e.message
                                        })
                                        return false;
                                    }
                                }
                            }
                            else if(res.data.status !== 'pending') {
                                line.set_payment_status('retry');
                                return false
                            }
                        }
                        else {
                            line.set_payment_status('retry');
                            return false
                        }
                    }
                    catch(e) {
                        await sleep(8000)
                    }
                    await sleep(2000)
                }
                return true
            }
            catch(e) {
                line.set_payment_status('retry');
                return false
            }
         },
        send_payment_cancel: async function () {
            try {
                await this._super.apply(this, arguments);
                console.log('cancel')
                const data = this._terminal_pay_data();
                const terminalId = data.PaymentMethod.neat_clover_terminal_device_code
                await neatCloverRpc('/pos_clover/cancel_payment_request', {
                    terminal_id: terminalId,
                    order_id: data.OrderID,
                })
            }
            catch(e) {

            }
            return true;
        },
       _terminal_pay_data: function() {
              const order = this.pos.get_order();
              const line = order.selected_paymentline;
              const data = {
                    'Name': order.name,
                    'OrderID': order.uid,
                    'TimeStamp': moment().format(),
                    'Currency': this.pos.currency.name,
                    'RequestedAmount': line.amount,
                    'PaymentMethod': this.payment_method
              };
             return data;
       }
     });
    return PaymentTerminal;
});
