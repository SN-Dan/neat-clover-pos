odoo.define('pos_neatclover.models', function(require) {
    'use strict';
    
    var models = require('point_of_sale.models');
    var PaymentTerminal = require('pos_neatclover.payment');
    var patch = require('web.utils').patch;
    
    models.register_payment_method('neatclover', PaymentTerminal);
    if(models.load_fields) {
        models.load_fields('pos.payment.method', ['neat_clover_terminal_device_code', 'neat_clover_is_mobile', 'neat_clover_is_desktop_mode', 'neat_clover_is_local_ws_server', 'neat_clover_ws_url', 'neat_clover_is_terminal_printer_communication_allowed', 'neat_clover_device_type']);
    }
    
    // Patch PosGlobalState with retry logic for _save_to_server
    patch(models.PosGlobalState.prototype, 'pos_neatclover.models', {
        _save_to_server: function(orders, options) {
            debugger
            var self = this;
            var maxRetries = 3;
            var retryDelay = 2000; // 2 seconds
            
            // Store reference to the original method
            var originalSaveToServer = this._super;
            
            console.log('pos_neatclover: _save_to_server called');
            console.log('pos_neatclover: Order data:', orders);
            
            function attemptSave(attemptNumber) {
                console.log('pos_neatclover: Attempt ' + (attemptNumber + 1) + ' of ' + (maxRetries + 1));
                
                // Call original method with correct context
                return originalSaveToServer.call(self, orders, options)
                    .then(function(result) {
                        console.log('pos_neatclover: _save_to_server success on attempt ' + (attemptNumber + 1));
                        console.log('pos_neatclover: Result:', result);
                        return result;
                    })
                    .catch(function(error) {
                        console.error('pos_neatclover: Attempt ' + (attemptNumber + 1) + ' failed:', error);
                        
                        if (error && attemptNumber < maxRetries) {
                            console.warn('pos_neatclover: Network error detected, retrying in ' + retryDelay + 'ms...');
                            return new Promise(function(resolve) {
                                setTimeout(function() {
                                    resolve(attemptSave(attemptNumber + 1));
                                }, retryDelay);
                            });
                        } else {
                            console.error('pos_neatclover: Max retries reached or non-network error:', error);
                            throw error;
                        }
                    });
            }
            
            return attemptSave(0);
        }
    });
});

