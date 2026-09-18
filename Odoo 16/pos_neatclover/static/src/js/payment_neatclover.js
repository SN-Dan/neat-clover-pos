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
                max-width: 400px;
            }

            /* Button styles */
            .neat-clover-modal-button {
                width: calc(100% - 20px);
                height: 55px;
                margin: 5px;
                cursor: pointer;
                font-size: 25px;
                border: none;
                background: darkseagreen;
                color: white;
            }
            .neat-clover-modal-input {
                width: calc(100% - 20px);
                height: 45px;
                margin: 5px;
                padding: 10px;
                font-size: 20px;
                border: 1px solid #ccc;
                border-radius: 4px;
                box-sizing: border-box;
            }
        `;

        // Create a <style> element and append it to the document's <head>
        const styleElement = document.createElement('style');
        styleElement.innerHTML = customModalStyles;
        document.head.appendChild(styleElement);
    }
    async function displaySyncModal() {
        if (document.querySelector('.neat-clover-modal')) {
            return; // Modal already exists, do nothing
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

        // Add the modal to the document body
        document.body.appendChild(modal);
        modal.addEventListener('keydown', function(e) { e.stopPropagation(); });
        modal.addEventListener('keyup', function(e) { e.stopPropagation(); });
        modal.addEventListener('keypress', function(e) { e.stopPropagation(); });

        // Function to close the modal
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
        // Event listeners for button clicks
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


    // Online WS relay (AWS). Frontend uses short-lived ?accessToken= (never the license key).
    var NEAT_CLOVER_ONLINE_WS_URL = "wss://bqhdar6mj1.execute-api.eu-central-1.amazonaws.com/prod";
    var NEAT_CLOVER_WS_TOKEN_REFRESH_SKEW = 300; // refresh when < 5 minutes left

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
    const core = require('web.core');
    const rpc = require('web.rpc');
    const PaymentInterface = require('point_of_sale.PaymentInterface');
    const { Gui } = require('point_of_sale.Gui');
    const _t = core._t;
    const PaymentTerminal = PaymentInterface.extend({
        init: function () {
            this._super.apply(this, arguments);
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
                // Only wire/connect desktop WS for the payment method matching the synced terminal
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
        send_payment_request: async function(cid) {
            try {
                await this._super.apply(this, arguments);
                const line = this.pos.get_order().selected_paymentline;
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
                    const iosr = await rpc.query({
                        route: '/pos_clover/is_order_the_same',
                        params: {
                            refunded_order_line_ids
                        }
                    })

                    if(!iosr || !iosr.data || !iosr.data.is_order_the_same) {
                        line.set_payment_status('retry');
                        throw new Error('Cannot have multiple refunds in an order.');
                        return
                    }
                }

                var refunded_order_line_id = undefined
                if(refunded_order_line_ids.length) {
                    refunded_order_line_id = refunded_order_line_ids[0]
                }

                var user_id = null
                if(order.cashier) {
                    user_id = order.cashier.id
                }
                else {
                    user_id = order.employee.user_id[0]
                }

                const params = {
                    terminal_id: terminalId,
                    order_id: data.OrderID,
                    amount: data.RequestedAmount,
                    user_id: user_id,
                    refunded_order_line_id,
                }

                const result = await rpc.query({
                    route: '/pos_clover/create_payment_request',
                    params
                })
                if(!result || result.status === 403 || result.status === 400) {
                    line.set_payment_status('retry');
                    return false
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
                        const res = await rpc.query({
                            route: '/pos_clover/check_request',
                            params: {
                                terminal_id: terminalId,
                                transaction_id: result.data.transaction_id,
                            }
                        })

                        if(res && res.status === 200) {
                            if(res.data.status === 'done' || res.data.status === 'refunded' || res.data.status === 'resent_done' || res.data.status === 'resent_refunded') {
                                const processed_result = await rpc.query({
                                    route: '/pos_clover/request_processed',
                                    params: {
                                        terminal_id: terminalId,
                                        transaction_id: res.data.transaction_id,
                                    }
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
                                        await rpc.query({
                                            route: '/pos_clover/log_message_ui',
                                            params: {
                                                terminal_id: terminalId,
                                                transaction_id: res.data.transaction_id,
                                                type: 'error',
                                                message: 'Error setting payment status: ' + e.message
                                            }
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
                const line = this.pos.get_order().selected_paymentline;
                const data = this._terminal_pay_data();
                const terminalId = data.PaymentMethod.neat_clover_terminal_device_code
                const res = await rpc.query({
                    route: '/pos_clover/cancel_payment_request',
                    params: {
                        terminal_id: terminalId,
                        order_id: data.OrderID,
                    }
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
