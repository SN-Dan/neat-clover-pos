/** @odoo-module */

import { patch } from "@web/core/utils/patch";
import { ControlButtons } from "@point_of_sale/app/screens/product_screen/control_buttons/control_buttons";

function hasNeatCloverDesktopSync(pos) {
    const device = window.navigator.userAgent;
    const isMobile = device.includes("Android") || window.isNeatPOSAndroidApp;
    if (isMobile) {
        return false;
    }
    let methods = [];
    if (pos?.models?.["pos.payment.method"]?.getAll) {
        methods = pos.models["pos.payment.method"].getAll();
    } else if (pos?.payment_methods) {
        methods = pos.payment_methods;
    } else if (pos?.config?.payment_method_ids) {
        methods = pos.config.payment_method_ids;
    }
    return methods.some(
        (pm) => pm.use_payment_terminal === "neatclover" && pm.neat_clover_is_desktop_mode
    );
}

patch(ControlButtons.prototype, {
    get showNeatCloverSyncDeviceButton() {
        return hasNeatCloverDesktopSync(this.pos);
    },
    onClickNeatCloverSyncDevice() {
        if (window.displaySyncModal) {
            window.displaySyncModal();
        }
    },
});
