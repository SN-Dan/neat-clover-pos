/** @odoo-module */

import { _t } from "@web/core/l10n/translation";
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { PaymentInterface } from "@point_of_sale/app/utils/payment/payment_interface";

// Online WS relay (AWS). Frontend uses short-lived ?accessToken= (never the license key).
const NEAT_CLOVER_ONLINE_WS_URL = "wss://bqhdar6mj1.execute-api.eu-central-1.amazonaws.com/prod";
const NEAT_CLOVER_WS_TOKEN_REFRESH_SKEW = 300; // refresh when < 5 minutes left

function neatCloverDesktopWsSend(msgType, payload) {
    if (!window.desktop_ws || window.desktop_ws.readyState !== WebSocket.OPEN) {
        return;
    }
    window.desktop_ws.send(JSON.stringify({ type: "message", msgType, msgPayload: payload }));
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

export class PaymentNeatClover extends PaymentInterface {
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    addCss() {
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
    async displaySyncModal() {
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
            const rpcCall = this.env.services.orm.rpc.bind(this.env.services.orm);
            const result = await rpcCall('/pos_clover/device_codes', {});
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
            window.socket_connect(true)
        });
    }
    async socket_connect(initialConnect = false) {
        if(!window.desktop_ws || !initialConnect) {
            if (window.desktop_ws_is_online) {
                const token = await neatCloverEnsureDesktopAccessToken(
                    window.desktop_ws_token_rpc,
                    window.desktop_ws_payment_method_id,
                );
                if (!token) {
                    setTimeout(() => {
                        if (window.socket_connect) {
                            window.socket_connect(initialConnect);
                        }
                    }, 1000);
                    return;
                }
                window.desktop_ws_url = `${NEAT_CLOVER_ONLINE_WS_URL}?accessToken=${encodeURIComponent(token)}`;
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
                    const barcodeInput = document.querySelector('body .o-barcode-input');
                    console.log(barcodeInput);

                    for (let i = 0; i < msg.msgPayload.length; i++) {
                        const char = msg.msgPayload.charAt(i);
                        const event = new KeyboardEvent('keydown', {
                            key: char,
                            bubbles: true,
                            cancelable: true
                        });
                        console.log(char);
                        document.body.dispatchEvent(event);
                    }
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
                setTimeout(window.socket_connect, 1000);
            }
        }
    }
    /**
     * @override
    */
    setup() {
        super.setup(...arguments);
        if (!window.is_printing_allowed_desktop_ws_map) {
            window.is_printing_allowed_desktop_ws_map = {}
        }
        this.addCss()
        window.displaySyncModal = this.displaySyncModal.bind(this)
        const device = window.navigator.userAgent
        const isMobile = device.includes("Android") || window.isNeatPOSAndroidApp
        var pm = this.payment_method
        if(!pm) {
            pm = this.payment_method_id
        }
        if(pm && pm.neat_clover_is_desktop_mode && !isMobile){
            window.is_printing_allowed_desktop_ws_map[pm.neat_clover_terminal_device_code] = pm.neat_clover_is_terminal_printer_communication_allowed
            let wsUrl = false
            let isOnlineDesktop = false
            if (pm.neat_clover_is_local_ws_server && pm.neat_clover_ws_url) {
                wsUrl = pm.neat_clover_ws_url
                isOnlineDesktop = false
            } else if (!pm.neat_clover_is_local_ws_server) {
                wsUrl = NEAT_CLOVER_ONLINE_WS_URL
                isOnlineDesktop = true
            }
            if(wsUrl) {
                window.socket_connect = this.socket_connect.bind(this)
                window.desktop_ws_url = wsUrl
                window.desktop_ws_is_online = isOnlineDesktop
                window.desktop_ws_payment_method_id = pm.id
                window.desktop_ws_token_rpc = this.env.services.orm.rpc.bind(this.env.services.orm)
                window.desktop_ws_send_message = neatCloverDesktopWsSend
                const rpcCall = this.env.services.orm.rpc.bind(this.env.services.orm);
                window.desktop_ws_upload_print = async (image) => {
                    try {
                        const result = await rpcCall('/pos_clover/desktop_print/upload', { image });
                        if (result && result.status === 200 && result.data && result.data.print_id) {
                            return result.data.print_id;
                        }
                    } catch (e) {
                        console.error('Desktop print upload failed', e);
                    }
                    return false;
                };
                window.desktop_ws_send_print = async (image) => {
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
                if(localStorage.getItem("neat_synced_device_code")) {
                    this.socket_connect(true)
                }
                else {
                    this.displaySyncModal()
                }
            }
        }
    }
    /**
     * @override
    */
    async sendPaymentRequest (cid) {
        try {
            super.sendPaymentRequest(...arguments);
            const line = this._get_payment_line();
            const order = this.pos.getOrder();
            const data = this._terminal_pay_data();
            const terminalId = data.PaymentMethod.neat_clover_terminal_device_code
            const refunded_order_line_ids = []
            
            for(let i = 0; i < order.lines.length; i++) {
                var orderline = order.lines[i]
                if(orderline.refunded_orderline_id) {
                    refunded_order_line_ids.push(orderline.refunded_orderline_id.id)
                }
            }
            
            if(refunded_order_line_ids.length > 1) {
                try {
                    const iosr = await this.env.services.orm.rpc('/pos_clover/is_order_the_same', {
                            refunded_order_line_ids
                    })

                    if(!iosr || !iosr.data || !iosr.data.is_order_the_same) {
                        line.setPaymentStatus('retry');
                        throw new Error('Cannot have multiple refunds in an order.');
                        return
                    }
                }
                catch(e) {
                    line.setPaymentStatus('retry');
                    throw new Error('Cannot have multiple refunds in an order.');
                    return
                }
            }

            var refunded_order_line_id = undefined
            if(refunded_order_line_ids.length) {
                refunded_order_line_id = refunded_order_line_ids[0]
            }

            const params = {
                terminal_id: terminalId,
                order_id: data.OrderID,
                amount: data.RequestedAmount,
                user_id: order.user_id.id,
                refunded_order_line_id,
            }
            const result = await this.env.services.orm.rpc('/pos_clover/create_payment_request', params)
            if(!result || result.status === 403 || result.status === 400) {
                line.setPaymentStatus('retry');
                return false
            }
            const device = window.navigator.userAgent
            const isMobile = device.includes("Android") || window.isNeatPOSiOSApp
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
            
            line.setPaymentStatus('waitingCard');
            while(true) {
                try {
                    const res = await this.env.services.orm.rpc('/pos_clover/check_request', {
                        terminal_id: terminalId,
                        transaction_id: result.data.transaction_id,
                    })

                    if(res && res.status === 200) {
                        if(res.data.status === 'done' || res.data.status === 'refunded' || res.data.status === 'resent_done' || res.data.status === 'resent_refunded') {
                            const processed_result = await this.env.services.orm.rpc('/pos_clover/request_processed', {
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
                                    line.setPaymentStatus('done');
                                    return true
                                }
                                catch(e) {
                                    console.log(e)
                                    await this.env.services.orm.rpc('/pos_clover/log_message_ui', {
                                        terminal_id: terminalId,
                                        transaction_id: res.data.transaction_id,
                                        type: 'error',
                                        message: 'Error setting payment status: ' + e.message
                                    })
                                    return false
                                }
                            }
                        }
                        else if(res.data.status !== 'pending') {
                            line.setPaymentStatus('retry');
                            return false
                        }
                    }
                    else {
                        line.setPaymentStatus('retry');
                        return false
                    }
                }
                catch(e) {

                }
                await this.sleep(2000)
            }
            return true
        }
        catch(e) {
            const line = this._get_payment_line();
            line.setPaymentStatus('retry');
            return false
        }
    }
    /**
     * @override
    */
    async sendPaymentCancel(order, uuid) {
        try {
            const data = this._terminal_pay_data();
            const terminalId = data.PaymentMethod.neat_clover_terminal_device_code;
            const activePaymentResult = await this.env.services.orm.rpc('/pos_clover/has_active_payment_request', {
                terminal_id: terminalId,
                order_id: data.OrderID,
            });
            if (activePaymentResult && activePaymentResult.status === 200 && activePaymentResult.data && activePaymentResult.data.has_active_payment) {
                this.env.services.dialog.add(AlertDialog, {
                    title: _t('Active Terminal Payment'),
                    body: _t('Please cancel the payment from the terminal before cancelling it in Odoo.'),
                });
                return false;
            }
            super.sendPaymentCancel(...arguments);
            await this.env.services.orm.rpc('/pos_clover/cancel_payment_request', {
                terminal_id: terminalId,
                order_id: data.OrderID,
            })
        }
        catch(e) {
            return false;
        }
        return true;
    }
    _get_payment_line() {
        var line = this.pos.getOrder().getSelectedPaymentline()
        return line
    }
    _terminal_pay_data() {
          const order = this.pos.getOrder();
          const line = this._get_payment_line();
          var orderId = order.uid
          if(!orderId) {
            orderId = order.pos_reference
          }
          var pm = this.payment_method
          if(!pm) {
            pm = this.payment_method_id
          }
          const data = {
                'Name': order.name,
                'OrderID': orderId,
                'Currency': this.pos.currency.name,
                'RequestedAmount': line.amount,
                'PaymentMethod': pm
          };
         return data;
    }
}


