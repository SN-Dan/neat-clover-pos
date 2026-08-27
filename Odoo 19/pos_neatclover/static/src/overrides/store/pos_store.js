/** @odoo-module */

import { PosStore } from "@point_of_sale/app/services/pos_store";
import { patch } from "@web/core/utils/patch";

patch(PosStore.prototype, {
    async syncAllOrders(options) {
        const maxRetries = 3;
        const retryDelay = 2000; // 2 seconds
        
        console.log('pos_neatclover: syncAllOrders called');
        
        const attemptSync = async (attemptNumber) => {
            console.log('pos_neatclover: Attempt ' + (attemptNumber + 1) + ' of ' + (maxRetries + 1));
            
            try {
                // Call original method
                const result = await super.syncAllOrders(options);
                console.log('pos_neatclover: syncAllOrders success on attempt ' + (attemptNumber + 1));
                console.log('pos_neatclover: Result:', result);
                return result;
            } catch (error) {
                console.error('pos_neatclover: Attempt ' + (attemptNumber + 1) + ' failed:', error);
                
                if (error && attemptNumber < maxRetries) {
                    console.warn('pos_neatclover: Network error detected, retrying in ' + retryDelay + 'ms...');
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                    return attemptSync(attemptNumber + 1);
                } else {
                    console.error('pos_neatclover: Max retries reached or non-network error:', error);
                    throw error;
                }
            }
        };
        
        return attemptSync(0);
    }
});
