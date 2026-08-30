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

    let insightCache = null;

    const NUMERIC_FIELDS = [
        'bedrooms', 'bathrooms', 'sqft_living', 'sqft_lot', 'floors',
        'waterfront', 'view', 'condition', 'city', 'sqft_above',
        'sqft_basement', 'yr_built', 'yr_renovated',
        'sqft_basement_imputed', 'yr_renovated_imputed',
    ];

    const cityNames = {
        '1': 'Seattle', '2': 'Bellevue', '3': 'Redmond', '4': 'Kent',
        '5': 'Shoreline', '6': 'Issaquah', '7': 'Sammamish', '8': 'Kenmore',
        '9': 'Woodinville', '10': 'Factoria', '11': 'Other'
    };

    // Random ranges for each field
    const randomRanges = {
        bedrooms: [1, 6],
        bathrooms: [1, 4],
        sqft_living: [600, 4500],
        sqft_lot: [1000, 15000],
        floors: [1, 2.5],
        waterfront: [0, 1],
        view: [0, 4],
        condition: [1, 5],
        city: [1, 10],
        sqft_above: [500, 4000],
        sqft_basement: [0, 1500],
        yr_built: [1960, 2024],
        yr_renovated: [0, 2024],
    };

    // Seattle-area zip codes
    const zipCodes = ['98101', '98102', '98103', '98104', '98105', '98106', '98107', '98108', '98109', '98112', '98115', '98116', '98117', '98118', '98119', '98121', '98122', '98125', '98126', '98133', '98134', '98136', '98144', '98145', '98146', '98155', '98166', '98177', '98178', '98188', '98199'];

    function init() {
        document.getElementById('floors').value = '1';
        form.addEventListener('submit', handleSubmit);

        const inputs = form.querySelectorAll('input[required], select[required]');
        inputs.forEach((input) => {
            input.addEventListener('blur', () => validateInput(input));
            input.addEventListener('input', () => clearError(input));
            input.addEventListener('change', () => clearError(input));
        });
    }

    // Randomize form with realistic random values
    window.randomizeForm = function() {
        const pick = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
        const pickStep = (min, max, step) => {
            const steps = Math.floor((max - min) / step);
            return min + pick(0, steps) * step;
        };

        const bedrooms = pick(1, 5);
        const bathrooms = pick(1, Math.min(bedrooms, 4));
        const sqft_living = pickStep(700, 3500, 10);
        const floors = [1, 1.5, 2, 2.5][pick(0, 3)];

        document.getElementById('bedrooms').value = bedrooms;
        document.getElementById('bathrooms').value = pick(1, bathrooms) + (Math.random() > 0.5 ? 0.5 : 0);
        document.getElementById('sqft_living').value = sqft_living;
        document.getElementById('sqft_lot').value = pickStep(2000, 10000, 50);
        document.getElementById('floors').value = floors;
        document.querySelector('input[name="waterfront"][value="' + pick(0, 1) + '"]').checked = true;
        document.getElementById('view').value = pick(0, 4);
        document.getElementById('condition').value = pick(2, 5);

        const cities = ['Seattle','Bellevue','Redmond','Kent','Shoreline','Issaquah','Sammamish','Kenmore','Woodinville','Factoria'];
        document.getElementById('city').value = pick(1, 10);

        document.getElementById('statezip').value = 'WA ' + zipCodes[pick(0, zipCodes.length - 1)];

        const sqft_above = pickStep(Math.max(500, Math.floor(sqft_living * 0.6)), sqft_living, 10);
        document.getElementById('sqft_above').value = sqft_above;
        document.getElementById('sqft_basement').value = Math.max(0, sqft_living - sqft_above);

        document.getElementById('yr_built').value = pick(1970, 2023);
        document.getElementById('yr_renovated').value = Math.random() > 0.7 ? pick(2005, 2023) : 0;

        insightCache = null;
    };

    function collectFeatures() {
        const formData = new FormData(form);
        const features = Object.fromEntries(formData.entries());

        NUMERIC_FIELDS.forEach((key) => {
            if (features[key] !== undefined && features[key] !== '') {
                features[key] = Number(features[key]);
            }
        });

        if (features.waterfront === undefined) features.waterfront = 0;
        if (features.sqft_basement_imputed === undefined) features.sqft_basement_imputed = 0;
        if (features.yr_renovated_imputed === undefined) features.yr_renovated_imputed = 0;

        return features;
    }

    function validateInput(input) {
        const errorEl = input.parentElement.querySelector('.error-message');
        if (!input.checkValidity()) {
            input.classList.add('error');
            if (errorEl) errorEl.textContent = input.validationMessage || 'Please enter a valid value.';
            return false;
        } else {
            input.classList.remove('error');
            if (errorEl) errorEl.textContent = '';
            return true;
        }
    }

    function clearError(input) {
        const errorEl = input.parentElement.querySelector('.error-message');
        input.classList.remove('error');
        if (errorEl) errorEl.textContent = '';
    }

    function clearErrors() {
        document.querySelectorAll('.error-message').forEach(el => el.textContent = '');
        document.querySelectorAll('.error').forEach(el => el.classList.remove('error'));
    }

    function validateForm() {
        let isValid = true;
        form.querySelectorAll('input[required], select[required]').forEach((input) => {
            if (!validateInput(input)) isValid = false;
        });
        return isValid;
    }

    function displayResult(result) {
        const fmt = new Intl.NumberFormat('en-US', {
            style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0
        });

        // Main price (ensemble)
        const mainPrice = result.ensemble_price || result.predicted_price || 0;
        predictedPriceEl.textContent = fmt.format(mainPrice);
        priceLowEl.textContent = fmt.format(result.price_range_low || 0);
        priceHighEl.textContent = fmt.format(result.price_range_high || 0);

        // Model comparison tags
        const compEl = document.getElementById('model-comparison');
        if (compEl) {
            let html = '<div class="model-tag rf"><span class="label">RF</span> ' + fmt.format(result.predicted_price || 0) + '</div>';
            if (result.dl_price) {
                html += '<div class="model-tag dl"><span class="label">DL</span> ' + fmt.format(result.dl_price) + '</div>';
                html += '<div class="model-tag ensemble"><span class="label">Ensemble</span> ' + fmt.format(result.ensemble_price || 0) + '</div>';
            }
            compEl.innerHTML = html;
        }

        resultSection.style.display = 'block';
        resultSection.classList.add('active');
    }

    function generateInsights(features) {
        if (insightCache) {
            renderInsights(insightCache);
            insightsSection.style.display = 'block';
            insightsSection.classList.add('active');
            return;
        }

        const insights = [];

        if (features.sqft_living > 3000) {
            insights.push({ icon: '🏠', title: 'Large Home Premium', description: 'Your home is larger than 85% of properties in the region, commanding a significant price premium.' });
        } else if (features.sqft_living < 1000) {
            insights.push({ icon: '🏠', title: 'Compact Living', description: 'Smaller homes in this area are in high demand among first-time buyers and investors.' });
        }

        if (features.city) {
            const cityName = cityNames[features.city] || 'Selected area';
            insights.push({ icon: '📍', title: `${cityName} Location`, description: `${cityName} properties historically command a ${features.city <= 3 ? 'premium' : 'competitive'} price compared to other areas.` });
        }

        const currentYear = new Date().getFullYear();
        if (features.yr_built > currentYear - 10) {
            insights.push({ icon: '🆕', title: 'New Construction', description: 'Newer homes typically require less maintenance and often include modern amenities and energy efficiency.' });
        } else if (features.yr_built < 1950) {
            insights.push({ icon: '🏛️', title: 'Classic Character', description: 'Older homes in this area often have unique architectural details and established landscaping.' });
        }

        if (features.yr_renovated > 0 && features.yr_renovated > features.yr_built) {
            insights.push({ icon: '🔨', title: 'Recently Renovated', description: 'Recent renovations typically add value and reduce immediate maintenance costs.' });
        }

        if (features.waterfront === 1) {
            insights.push({ icon: '🌊', title: 'Waterfront Property', description: 'Waterfront properties in the Seattle area command a significant premium of 30-50% over comparable homes.' });
        }

        if (insights.length === 0) {
            insights.push({ icon: '📊', title: 'Balanced Property', description: 'Your property features are well-balanced. Consider small upgrades to increase value.' });
        }

        insightCache = insights;
        renderInsights(insights);
        insightsSection.style.display = 'block';
        insightsSection.classList.add('active');
    }

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

    async function readApiError(response) {
        try {
            const errorData = await response.json();
            return errorData.detail || errorData.message || `Request failed: ${response.status}`;
        } catch {
            return `Request failed: ${response.status}`;
        }
    }

    async function handleSubmit(event) {
        event.preventDefault();
        clearErrors();
        if (!validateForm()) return;

        const features = collectFeatures();
        const submitBtn = form.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2v4M12 20v4M4.93 4.93l2.83 2.83M16 12l-2.83 2.83M8 12l2.83 2.83M9 10v10m11-10v10"/></svg> Predicting...';

        try {
            const response = await fetch('/predict', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(features),
            });

            if (!response.ok) {
                const message = await readApiError(response);
                throw new Error(message);
            }

            const result = await response.json();
            displayResult(result);
            generateInsights(features);
        } catch (error) {
            console.error('Prediction error:', error);
            alert(error.message || 'Unable to connect to prediction service. Please try again.');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
        }
    }

    document.addEventListener('DOMContentLoaded', init);
})();
