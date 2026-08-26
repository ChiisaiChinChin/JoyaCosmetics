// Global Wishlist Array
let wishlist = JSON.parse(localStorage.getItem('wishlist')) || [];

document.addEventListener('DOMContentLoaded', () => {
    updateWishlistBadge();

    const container = document.getElementById('SingleProductView');

    // --- DEBUG LOGS ---
    const rawSelected = sessionStorage.getItem('selectedProduct');
    const rawCatalog = localStorage.getItem('allProductsCatalog');

    console.log("🔍 DEBUG - Selected Product in sessionStorage:", rawSelected ? JSON.parse(rawSelected) : "EMPTY / NULL");
    console.log("🔍 DEBUG - Catalog items in localStorage:", rawCatalog ? JSON.parse(rawCatalog).length + " items" : "EMPTY / NULL");

    if (!container) {
        console.error("❌ Could not find element with id='SingleProductView' in product.html!");
        return;
    }

    if (!rawSelected) {
        container.innerHTML = `
            <div style="text-align:center; padding: 3rem 1rem;">
                <h2>המוצר אינו קיים או שפג תוקף העמוד</h2>
                <p>אנא חזור לקטלוג ובחר מוצר שנית.</p>
                <button onclick="window.location.href='index.html'" style="margin-top: 1rem; padding: 0.5rem 1rem; cursor: pointer;">חזרה לקטלוג</button>
            </div>
        `;
        return;
    }

    const currentItem = JSON.parse(rawSelected);
    renderSingleProduct(currentItem);
    syncHeartIcons();
    renderRelatedProducts(currentItem);
});

/* ==========================================
   HELPERS: CATEGORY & IMAGE PARSING
   ========================================== */
function extractCategoryName(cat) {
    if (!cat) return 'Product';
    if (typeof cat === 'object') {
        return cat.fields?.title || cat.fields?.name || cat.sys?.id || 'Product';
    }
    return String(cat).trim();
}

function formatImageUrl(url) {
    if (!url) return 'Pictures/placeholder.png';
    if (typeof url === 'object') {
        url = url.fields?.file?.url || '';
    }
    if (typeof url === 'string' && url.startsWith('//')) {
        return 'https:' + url;
    }
    return url;
}

/* ==========================================
   1. SINGLE PRODUCT VIEW
   ========================================== */
function renderSingleProduct(item) {
    const container = document.getElementById('SingleProductView');
    if (!container) return;

    const name = item.name || item.title || 'מוצר';
    const price = item.price || 0;
    const isOnSale = item.onsale === true || item.onsale === "true" || item.onSale === true;
    const salePrice = (item.saleprice !== undefined && item.saleprice !== "") ? item.saleprice : price;
    const about = item.about || name;
    const Category = extractCategoryName(item.category);
    const id = item.id;
    const imageUrl = formatImageUrl(item.img || item.image || item.pic);

    const activePrice = isOnSale ? salePrice : price;
    const safeName = name.replace(/'/g, "\\'");

    wishlist = JSON.parse(localStorage.getItem('wishlist')) || [];
    const isWishlisted = wishlist.some(w => String(w.id) === String(id));
    const heartStateClass = isWishlisted ? 'filled' : 'outline';

    let priceHTML = `<div class="p-price"><span class="Price new-price">₪${price}</span></div>`;
    if (isOnSale && salePrice) {
        priceHTML = `
            <div class="p-price">
                <span class="old-price" style="opacity: 0.5;">₪${price}</span>
                <span class="Price new-price">₪${salePrice}</span>
            </div>
        `;
    }

    container.innerHTML = `
        <div class="product-page-image">
            <img src="${imageUrl}" alt="${name}" onerror="this.onerror=null; this.src='Pictures/placeholder.png';">
        </div>
        <div class="product-page-info">
            <h1>${name}</h1>
            <p class="description">${about}</p>
            ${priceHTML}

            <div class="p-actions">
                <button class="add-to-cart AddToCart" onclick="AddCartItem('${safeName}', '${id}', '${activePrice}', '${imageUrl}')">
                    הוסף לסל
                </button>
                <i class="fa-heart wishlist-heart ${heartStateClass}" 
                   data-id="${id}" 
                   onclick="toggleWishlist(this, { id: '${id}', name: '${safeName}', price: ${price}, img: '${imageUrl}', category: '${Category}', onsale: ${isOnSale}, saleprice: '${salePrice}' })">
                </i>
            </div>
        </div>
    `;
}

/* ==========================================
   2. RELATED PRODUCTS LOGIC (WITH FALLBACK)
   ========================================== */
function renderRelatedProducts(currentProduct) {
    const container = document.getElementById('RelatedProductsList');
    const section = document.querySelector('.related-products-section');
    if (!container) return;

    // Load full catalog from localStorage
    const rawCatalog = JSON.parse(localStorage.getItem('allProductsCatalog')) || [];

    if (!rawCatalog || rawCatalog.length === 0) {
        console.warn("⚠️ Related Products: 'allProductsCatalog' in localStorage is empty or missing!");
        if (section) section.style.display = 'none';
        return;
    }

    // Standardize all catalog items
    const normalizedCatalog = rawCatalog.map(item => {
        const fields = item.fields || item;
        return {
            id: String(fields.id || item.sys?.id || ''),
            name: fields.name || fields.title || 'מוצר',
            price: fields.price || 0,
            saleprice: fields.saleprice || fields.salePrice || '',
            onsale: fields.onsale === true || fields.onSale === true,
            category: extractCategoryName(fields.category || fields.Category),
            about: fields.about || fields.name || '',
            img: formatImageUrl(fields.pic || fields.img || fields.image)
        };
    });

    const currentCategory = extractCategoryName(currentProduct.category).toLowerCase().trim();
    const currentId = String(currentProduct.id || '');

    // 1. Try exact category match (excluding current item)
    let relatedItems = normalizedCatalog.filter(item => {
        const itemCat = item.category.toLowerCase().trim();
        return itemCat === currentCategory && item.id !== currentId;
    });

    // 2. FALLBACK: If no products match exact category, grab any other products from catalog
    if (relatedItems.length === 0) {
        console.log("ℹ️ No exact category match found. Falling back to other catalog products.");
        relatedItems = normalizedCatalog.filter(item => item.id !== currentId);
    }

    if (relatedItems.length === 0) {
        if (section) section.style.display = 'none';
        return;
    }

    if (section) section.style.display = 'block';

    wishlist = JSON.parse(localStorage.getItem('wishlist')) || [];

    container.innerHTML = relatedItems.slice(0, 4).map(item => {
        const safeTitle = item.name.replace(/'/g, "\\'");
        const activePrice = item.onsale && item.saleprice ? item.saleprice : item.price;
        const isWishlisted = wishlist.some(w => String(w.id) === String(item.id));
        const heartStateClass = isWishlisted ? 'filled' : 'outline';
        
        // Safe JSON stringification for inline onclick
        const safeItemJSON = JSON.stringify(item).replace(/"/g, '&quot;');

        let priceHTML = `<div class="p-price"><span class="Price new-price">₪${item.price}</span></div>`;
        if (item.onsale && item.saleprice) {
            priceHTML = `
                <div class="p-price">
                    <span class="old-price" style="opacity: 0.5;">₪${item.price}</span>
                    <span class="Price new-price">₪${item.saleprice}</span>
                </div>
            `;
        }

        return `
        <li>
            <div class="product-card no-border" id="${item.id}">
                <div class="product-image">
                    <img class="ProductImg" 
                         onclick="goToProductPage(${safeItemJSON})" 
                         alt="${item.name}" 
                         src="${item.img}" 
                         onerror="this.onerror=null; this.src='Pictures/placeholder.png';"
                         style="cursor: pointer;" />
                </div>
                <div class="product-info">
                    <p class="p-name About" 
                       onclick="goToProductPage(${safeItemJSON})" 
                       style="cursor: pointer;">
                       ${item.about}
                    </p>
                    <p class="p-category AboutInv">${item.category}</p>
    
                    ${priceHTML}
    
                    <div class="p-actions">
                        <button class="add-to-cart AddToCart" name="${item.id}" onclick="AddCartItem('${safeTitle}', '${item.id}', '${activePrice}', '${item.img}')">
                            הוסף לסל
                        </button>
                        <i class="fa-heart wishlist-heart ${heartStateClass}" 
                            data-id="${item.id}" 
                            onclick="toggleWishlist(this, { id: '${item.id}', name: '${safeTitle}', price: ${item.price}, img: '${item.img}', category: '${item.category}', onsale: ${item.onsale}, saleprice: '${item.saleprice}' })">
                        </i>
                    </div>
                </div>
            </div>
        </li>
        `;
    }).join('');
}

/* ==========================================
   3. WISHLIST & ROUTING HELPERS
   ========================================== */
function toggleWishlist(element, product) {
    if (!product || !product.id) return;

    wishlist = JSON.parse(localStorage.getItem('wishlist')) || [];
    const existingIndex = wishlist.findIndex(item => String(item.id) === String(product.id));

    if (existingIndex > -1) {
        wishlist.splice(existingIndex, 1);
    } else {
        wishlist.push(product);
    }

    localStorage.setItem('wishlist', JSON.stringify(wishlist));
    updateWishlistBadge();
    syncHeartIcons();
}

function syncHeartIcons() {
    wishlist = JSON.parse(localStorage.getItem('wishlist')) || [];
    document.querySelectorAll('.wishlist-heart').forEach(heart => {
        const productId = heart.dataset.id;
        if (!productId) return;

        const existsInWishlist = wishlist.some(item => String(item.id) === String(productId));

        if (existsInWishlist) {
            heart.classList.remove('outline');
            heart.classList.add('filled');
        } else {
            heart.classList.remove('filled');
            heart.classList.add('outline');
        }
    });
}

function updateWishlistBadge() {
    wishlist = JSON.parse(localStorage.getItem('wishlist')) || [];
    const wishlistBadge = document.querySelector('.wishlist-icon .badge');
    if (wishlistBadge) {
        wishlistBadge.textContent = wishlist.length;
    }
}

function goToProductPage(product) {
    sessionStorage.setItem('selectedProduct', JSON.stringify(product));
    window.location.href = `product.html?id=${product.id}`;
}
