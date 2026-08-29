/* ==========================================================================
   AI House Price Predictor - JavaScript
   ========================================================================== */

(function() {
    'use strict';

    // DOM Elements
    const form = document.getElementById('property-form');
    const resultSection = document.getElementById('result-section');
    const insightsSection = document.getElementById('insights-section');
    const predictedPriceEl = document.getElementById('predicted-price');
    const priceLowEl = document.getElementById('price-low');
    const priceHighEl = document.getElementById('price-high');
    const insightsGrid = document.querySelector('.insights-grid');
    const chartsSection = document.getElementById('charts-section');
    const statsSummary = document.getElementById('stats-summary');

    // Mapping of insight values based on RF feature importances
    // Top features: sqft_living, statezip, yr_built, city, sqft_basement, etc.
    let insightCache = null;

    const NUMERIC_FIELDS = [
        'bedrooms',
        'bathrooms',
        'sqft_living',
        'sqft_lot',
        'floors',
        'waterfront',
        'view',
        'condition',
        'city',
        'sqft_above',
        'sqft_basement',
        'yr_built',
        'yr_renovated',
        'sqft_basement_imputed',
        'yr_renovated_imputed',
    ];

    // City display names
    const cityNames = {
        '1': 'Seattle',
        '2': 'Bellevue',
        '3': 'Redmond',
        '4': 'Kent',
        '5': 'Shoreline',
        '6': 'Issaquah',
        '7': 'Sammamish',
        '8': 'Kenmore',
        '9': 'Woodinville',
        '10': 'Factoria',
        '11': 'Other'
    };

    // Initialize the form
    function init() {
        // Set default values
        document.getElementById('floors').value = '1';

        // Form submission
        form.addEventListener('submit', handleSubmit);

        // Real-time validation
        const inputs = form.querySelectorAll('input[required], select[required]');
        inputs.forEach((input) => {
            input.addEventListener('blur', () => validateInput(input));
            input.addEventListener('input', () => clearError(input));
            input.addEventListener('change', () => clearError(input));
        });

        // Load charts and statistics
        loadStats();
    }

    // Collect features from form
    function collectFeatures() {
        const formData = new FormData(form);
        const features = Object.fromEntries(formData.entries());

        NUMERIC_FIELDS.forEach((key) => {
            if (features[key] !== undefined && features[key] !== '') {
                features[key] = Number(features[key]);
            }
        });

        if (features.waterfront === undefined) {
            features.waterfront = 0;
        }
        if (features.sqft_basement_imputed === undefined) {
            features.sqft_basement_imputed = 0;
        }
        if (features.yr_renovated_imputed === undefined) {
            features.yr_renovated_imputed = 0;
        }

        return features;
    }

    // Validate a single input
    function validateInput(input) {
        const errorEl = input.parentElement.querySelector('.error-message');
        if (!input.checkValidity()) {
            input.classList.add('error');
            if (errorEl) {
                errorEl.textContent = input.validationMessage || 'Please enter a valid value.';
            }
            return false;
        } else {
            input.classList.remove('error');
            if (errorEl) {
                errorEl.textContent = '';
            }
            return true;
        }
    }

    // Clear error for a specific input
    function clearError(input) {
        const errorEl = input.parentElement.querySelector('.error-message');
        input.classList.remove('error');
        if (errorEl) {
            errorEl.textContent = '';
        }
    }

    // Clear all errors
    function clearErrors() {
        const errorMessages = document.querySelectorAll('.error-message');
        errorMessages.forEach(el => el.textContent = '');
        const errorInputs = document.querySelectorAll('.error');
        errorInputs.forEach(el => el.classList.remove('error'));
    }

    // Validate entire form
    function validateForm() {
        const inputs = form.querySelectorAll('input[required], select[required]');
        let isValid = true;

        inputs.forEach((input) => {
            if (!validateInput(input)) {
                isValid = false;
            }
        });

        return isValid;
    }

    // Display prediction results
    function displayResult(result) {
        // Format as currency
        const formatter = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        });

        predictedPriceEl.textContent = formatter.format(result.predicted_price || 0);
        priceLowEl.textContent = formatter.format(result.price_range_low || 0);
        priceHighEl.textContent = formatter.format(result.price_range_high || 0);

        // Show sections
        resultSection.style.display = 'block';
        resultSection.classList.add('active');
    }

    // Generate market insights
    function generateInsights(features) {
        // Cache insights to avoid regenerating
        if (insightCache) {
            renderInsights(insightCache);
            insightsSection.style.display = 'block';
            insightsSection.classList.add('active');
            return;
        }

        const insights = [];
        const price = parseFloat(predictedPriceEl.textContent.replace(/[^0-9.]/g, '')) || 0;

        // Sqft living insight
        if (features.sqft_living > 3000) {
            insights.push({
                icon: '🏠',
                title: 'Large Home Premium',
                description: 'Your home is larger than 85% of properties in the region, commanding a significant price premium.'
            });
        } else if (features.sqft_living < 1000) {
            insights.push({
                icon: '🏠',
                title: 'Compact Living',
                description: 'Smaller homes in this area are in high demand among first-time buyers and investors.'
            });
        }

        // City insight
        if (features.city) {
            const cityName = cityNames[features.city] || 'Selected area';
            insights.push({
                icon: '📍',
                title: `${cityName} Location`,
                description: `${cityName} properties historically command a ${features.city <= 3 ? 'premium' : 'competitive'} price compared to other areas.`
            });
        }

        // Year built insight
        const currentYear = new Date().getFullYear();
        if (features.yr_built > currentYear - 10) {
            insights.push({
                icon: '🆕',
                title: 'New Construction',
                description: 'Newer homes typically require less maintenance and often include modern amenities and energy efficiency.'
            });
        } else if (features.yr_built < 1950) {
            insights.push({
                icon: '🏛️',
                title: 'Classic Character',
                description: 'Older homes in this area often have unique architectural details and established landscaping.'
            });
        }

        // Renovation insight
        if (features.yr_renovated > 0 && features.yr_renovated > features.yr_built) {
            insights.push({
                icon: '🔨',
                title: 'Recently Renovated',
                description: 'Recent renovations typically add value and reduce immediate maintenance costs.'
            });
        }

        // Waterfront insight
        if (features.waterfront === 1) {
            insights.push({
                icon: '🌊',
                title: 'Waterfront Property',
                description: 'Waterfront properties in the Seattle area command a significant premium of 30-50% over comparable homes.'
            });
        }

        // If no insights generated, add a default one
        if (insights.length === 0) {
            insights.push({
                icon: '📊',
                title: 'Balanced Property',
                description: 'Your property features are well-balanced. Consider small upgrades to increase value.'
            });
        }

        insightCache = insights;
        renderInsights(insights);
        insightsSection.style.display = 'block';
        insightsSection.classList.add('active');
    }

    // Render insights to the grid
    function renderInsights(insights) {
        if (!insightsGrid) return;

        insightsGrid.innerHTML = insights.map(insight => `
            <div class="insight-card">
                <div class="insight-icon">${insight.icon}</div>
                <h4>${insight.title}</h4>
                <p>${insight.description}</p>
            </div>
        `).join('');
    }

    // Read API error message
    async function readApiError(response) {
        try {
            const errorData = await response.json();
            return errorData.detail || errorData.message || `Request failed: ${response.status}`;
        } catch {
            return `Request failed: ${response.status}`;
        }
    }

    // Handle form submission
    async function handleSubmit(event) {
        event.preventDefault();

        // Clear previous results
        clearErrors();

        // Validate form
        if (!validateForm()) {
            return;
        }

        // Get form data
        const features = collectFeatures();
        const submitBtn = form.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;

        // Show loading state
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2v4M12 20v4M4.93 4.93l2.83 2.83M16 12l-2.83 2.83M8 12l2.83 2.83M9 10v10m11-10v10"/></svg> Predicting...';

        try {
            // Send prediction request
            const response = await fetch('/predict', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(features),
            });

            if (!response.ok) {
                const message = await readApiError(response);
                throw new Error(message);
            }

            const result = await response.json();

            // Display results
            displayResult(result);
            
            // Generate insights
            generateInsights(features);

        } catch (error) {
            console.error('Prediction error:', error);
            alert(error.message || 'Unable to connect to prediction service. Please try again.');
        } finally {
            // Restore button state
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
        }
    }

    // Initialize the application
    document.addEventListener('DOMContentLoaded', init);

    // ---------------------------------------------------------------
    // Charts & Statistics
    // ---------------------------------------------------------------

    let chartsLoaded = false;

    function formatCurrency(val) {
        if (val >= 1000000) return '$' + (val / 1000000).toFixed(1) + 'M';
        if (val >= 1000) return '$' + (val / 1000).toFixed(0) + 'K';
        return '$' + val;
    }

    async function loadStats() {
        if (chartsLoaded) return;
        try {
            const resp = await fetch('/stats');
            if (!resp.ok) return;
            const data = await resp.json();
            renderFeatureImportance(data.feature_importance);
            renderPriceDistribution(data.price_distribution);
            renderCityPrices(data.avg_price_by_city);
            renderScatterPlot(data.price_vs_sqft);
            renderSummary(data.summary);
            chartsLoaded = true;
        } catch (e) {
            console.warn('Could not load stats:', e);
        }
    }

    function renderFeatureImportance(features) {
        const ctx = document.getElementById('chart-importance');
        if (!ctx) return;
        const labels = features.map(f => f.feature.replace('_', ' '));
        const values = features.map(f => f.importance);
        const colors = values.map((v, i) => {
            const hue = 240 + (i * 8);
            return `hsla(${hue}, 70%, 60%, 0.85)`;
        });
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Importance',
                    data: values,
                    backgroundColor: colors,
                    borderRadius: 6,
                    borderSkipped: false,
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(ctx) { return (ctx.parsed.x * 100).toFixed(1) + '%'; }
                        }
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        ticks: { callback: v => (v * 100).toFixed(0) + '%', font: { size: 11 } },
                        grid: { color: 'rgba(0,0,0,0.04)' }
                    },
                    y: {
                        ticks: { font: { size: 11 } },
                        grid: { display: false }
                    }
                }
            }
        });
    }

    function renderPriceDistribution(dist) {
        const ctx = document.getElementById('chart-price-dist');
        if (!ctx) return;
        const labels = dist.map(d => d.range);
        const counts = dist.map(d => d.count);
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Properties',
                    data: counts,
                    backgroundColor: 'rgba(79, 70, 229, 0.7)',
                    borderRadius: 6,
                    borderSkipped: false,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(ctx) { return ctx.parsed.y + ' properties'; }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { font: { size: 10 }, maxRotation: 45 },
                        grid: { display: false }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: { font: { size: 11 } },
                        grid: { color: 'rgba(0,0,0,0.04)' }
                    }
                }
            }
        });
    }

    function renderCityPrices(cities) {
        const ctx = document.getElementById('chart-city');
        if (!ctx) return;
        const labels = cities.map(c => c.city);
        const avgPrices = cities.map(c => c.avg_price);
        const counts = cities.map(c => c.count);
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Avg Price',
                    data: avgPrices,
                    backgroundColor: 'rgba(20, 184, 166, 0.7)',
                    borderRadius: 6,
                    borderSkipped: false,
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(ctx) {
                                const c = counts[ctx.dataIndex];
                                return formatCurrency(ctx.parsed.x) + ' (n=' + c + ')';
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        ticks: { callback: v => formatCurrency(v), font: { size: 11 } },
                        grid: { color: 'rgba(0,0,0,0.04)' }
                    },
                    y: {
                        ticks: { font: { size: 11 } },
                        grid: { display: false }
                    }
                }
            }
        });
    }

    function renderScatterPlot(points) {
        const ctx = document.getElementById('chart-scatter');
        if (!ctx) return;
        new Chart(ctx, {
            type: 'scatter',
            data: {
                datasets: [{
                    label: 'Properties',
                    data: points,
                    backgroundColor: 'rgba(236, 72, 153, 0.45)',
                    pointRadius: 4,
                    pointHoverRadius: 7,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(ctx) {
                                return ctx.parsed.x.toLocaleString() + ' sqft - ' + formatCurrency(ctx.parsed.y);
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        title: { display: true, text: 'Living Area (sqft)', font: { size: 11 } },
                        ticks: { font: { size: 10 } },
                        grid: { color: 'rgba(0,0,0,0.04)' }
                    },
                    y: {
                        title: { display: true, text: 'Price ($)', font: { size: 11 } },
                        ticks: { callback: v => formatCurrency(v), font: { size: 10 } },
                        grid: { color: 'rgba(0,0,0,0.04)' }
                    }
                }
            }
        });
    }

    function renderSummary(summary) {
        if (!statsSummary) return;
        const formatter = new Intl.NumberFormat('en-US', {
            style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0
        });
        statsSummary.innerHTML = `
            <div class="stat-card">
                <div class="stat-value">${formatter.format(summary.median)}</div>
                <div class="stat-label">Median Price</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${formatter.format(summary.mean)}</div>
                <div class="stat-label">Mean Price</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${summary.total_records.toLocaleString()}</div>
                <div class="stat-label">Total Records</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${formatter.format(summary.max)}</div>
                <div class="stat-label">Max Price</div>
            </div>
        `;
    }
})();