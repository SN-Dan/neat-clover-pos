/** @odoo-module */

import { Component } from "@odoo/owl";
import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen";
import { usePos } from "@point_of_sale/app/store/pos_hook";

function getNeatCloverMethods(pos) {
    const methods = (pos && pos.payment_methods) || [];
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

export class SyncDeviceButton extends Component {
    static template = "pos_neatclover.SyncDeviceButton";

    setup() {
        this.pos = usePos();
    }

    click() {
        if (window.displaySyncModal) {
            window.displaySyncModal();
        }
    }
}

export class PreAuthButton extends Component {
    static template = "pos_neatclover.PreAuthButton";

    setup() {
        this.pos = usePos();
    }

    click() {
        if (window.displayPreAuthModal) {
            window.displayPreAuthModal();
        }
    }
}

ProductScreen.addControlButton({
    component: SyncDeviceButton,
    condition: function () {
        return hasNeatCloverDesktopSync(this.pos);
    },
});

ProductScreen.addControlButton({
    component: PreAuthButton,
    condition: function () {
        return hasNeatCloverTerminal(this.pos);
    },
});
