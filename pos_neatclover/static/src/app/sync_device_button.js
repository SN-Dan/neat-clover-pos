/** @odoo-module */

import { patch } from "@web/core/utils/patch";
import { ControlButtons } from "@point_of_sale/app/screens/product_screen/control_buttons/control_buttons";

function getNeatCloverMethods(pos) {
    let methods = [];
    if (pos?.models?.["pos.payment.method"]?.getAll) {
        methods = pos.models["pos.payment.method"].getAll();
    } else if (pos?.payment_methods) {
        methods = pos.payment_methods;
    } else if (pos?.config?.payment_method_ids) {
        methods = pos.config.payment_method_ids;
    }
    return methods.filter((pm) => pm.use_payment_terminal === "neatclover");
}

function hasNeatCloverDesktopSync(pos) {
    const device = window.navigator.userAgent;
    const isMobile = device.includes("Android") || window.isNeatPOSAndroidApp;
    if (isMobile) {
        return false;
    }
    return getNeatCloverMethods(pos).some((pm) => pm.neat_clover_is_desktop_mode);
}

function hasNeatCloverTerminal(pos) {
    return getNeatCloverMethods(pos).length > 0;
}

patch(ControlButtons.prototype, {
    get showNeatCloverSyncDeviceButton() {
        return hasNeatCloverDesktopSync(this.pos);
    },
    get showNeatCloverPreAuthButton() {
        return hasNeatCloverTerminal(this.pos);
    },
    onClickNeatCloverSyncDevice() {
        this.props.close?.();
        if (window.displaySyncModal) {
            window.displaySyncModal();
        }
    },
    onClickNeatCloverPreAuth() {
        this.props.close?.();
        if (window.displayPreAuthModal) {
            window.displayPreAuthModal();
        }
    },
});
