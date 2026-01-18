const API_URL = 'https://antiscam.brimind.pro/api/categories';

let categoriesData = null;
let currentFilter = 'all';

async function fetchCategories() {
    try {
        const response = await fetch(API_URL);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        categoriesData = await response.json();
        displayData(categoriesData);
    } catch (error) {
        console.error('Error fetching categories:', error);
        document.getElementById('categoriesGrid').innerHTML = 
            '<div class="error">Failed to load categories. Please try again later.</div>';
    }
}

function displayData(data) {
    document.getElementById('totalCount').textContent = data.stats.total.toLocaleString();
    document.getElementById('trustedCount').textContent = data.stats.trusted.toLocaleString();
    document.getElementById('scamCount').textContent = data.stats.scam.toLocaleString();
    document.getElementById('undefinedCount').textContent = data.stats.undefined.toLocaleString();
    document.getElementById('minRisk').textContent = data.filters.minRiskPercentage;
    
    const allCategories = [
        ...data.lists.trusted.map(c => ({name: c, type: 'trusted'})),
        ...data.lists.scam.map(c => ({name: c, type: 'scam'})),
        ...data.lists.undefined.map(c => ({name: c, type: 'undefined'}))
    ];
    
    document.getElementById('allCount').textContent = `(${allCategories.length})`;
    document.getElementById('trustedTabCount').textContent = `(${data.lists.trusted.length})`;
    document.getElementById('scamTabCount').textContent = `(${data.lists.scam.length})`;
    document.getElementById('undefinedTabCount').textContent = `(${data.lists.undefined.length})`;
    
    displayCategories(allCategories);
}

function displayCategories(categories) {
    const grid = document.getElementById('categoriesGrid');
    if (!categories || categories.length === 0) {
        grid.innerHTML = '<div class="loading">No categories found</div>';
        return;
    }
    grid.innerHTML = categories.map(cat => {
        const categoryName = typeof cat === 'string' ? cat : cat.name;
        const categoryType = typeof cat === 'string' ? 'undefined' : cat.type;
        return `<div class="category-tag ${categoryType}" data-category="${categoryName}" data-type="${categoryType}" onclick="openGateio('${categoryName}')">${categoryName}</div>`;
    }).join('');
}

function openGateio(symbol) {
    const gateioUrl = `https://www.gate.io/fr/trade/${symbol}_USDT`;
    window.open(gateioUrl, '_blank');
}

function setupSearch() {
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', filterCategories);
}

function setupTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.type;
            filterCategories();
        });
    });
}

function filterCategories() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const categoryTags = document.querySelectorAll('.category-tag');
    
    categoryTags.forEach(tag => {
        const category = tag.dataset.category.toLowerCase();
        const type = tag.dataset.type;
        const matchesSearch = category.includes(searchTerm);
        const matchesFilter = currentFilter === 'all' || type === currentFilter;
        
        if (matchesSearch && matchesFilter) {
            tag.classList.remove('hidden');
        } else {
            tag.classList.add('hidden');
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    fetchCategories();
    setupSearch();
    setupTabs();
});