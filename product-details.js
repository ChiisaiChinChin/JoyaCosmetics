document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('SingleProductView');
    if (!container) return;

    updateWishlistBadge();

    const rawSelected = sessionStorage.getItem('selectedProduct');

    if (!rawSelected) {
        container.replaceChildren();

        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'text-align:center; padding: 3rem 1rem;';

        const title = document.createElement('h2');
        title.textContent = 'המוצר אינו קיים או שפג תוקף העמוד';

        const desc = document.createElement('p');
        desc.textContent = 'אנא חזור לקטלוג ובחר מוצר שנית.';

        const btn = document.createElement('button');
        btn.textContent = 'חזרה לקטלוג';
        btn.style.cssText = 'margin-top: 1rem; padding: 0.5rem 1rem; cursor: pointer;';
        btn.addEventListener('click', () => { window.location.href = 'index.html'; });

        wrapper.appendChild(title);
        wrapper.appendChild(desc);
        wrapper.appendChild(btn);
        container.appendChild(wrapper);
        return;
    }

    try {
        const currentItem = JSON.parse(rawSelected);
        renderSingleProduct(currentItem);
        syncHeartIcons();
        renderRelatedProducts(currentItem);
    } catch (e) {
        console.error("Error loading selected product:", e);
    }
});

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

    container.replaceChildren();

    const name = item.name || item.title || 'מוצר';
    const price = Number(item.price || 0);
    const isOnSale = item.onsale === true || item.onsale === "true" || item.onSale === true;
    const salePrice = (item.saleprice !== undefined && item.saleprice !== "") ? Number(item.saleprice) : price;
    const about = item.about || name;
    const Category = extractCategoryName(item.category);
    const id = String(item.id);
    const imageUrl = formatImageUrl(item.img || item.image || item.pic);
    const activePrice = isOnSale ? salePrice : price;

    const wishlist = JSON.parse(localStorage.getItem('wishlist')) || [];
    const isWishlisted = wishlist.some(w => String(w.id) === id);

    // Image Element
    const imgDiv = document.createElement('div');
    imgDiv.className = 'product-page-image';
    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = name;
    img.onerror = () => { img.src = 'Pictures/placeholder.png'; };
    imgDiv.appendChild(img);

    // Info Element
    const infoDiv = document.createElement('div');
    infoDiv.className = 'product-page-info';

    const h1 = document.createElement('h1');
    h1.textContent = name;

    const descP = document.createElement('p');
    descP.className = 'description';
    descP.textContent = about;

    // Price
    const priceDiv = document.createElement('div');
    priceDiv.className = 'p-price';

    if (isOnSale && salePrice) {
        const oldSpan = document.createElement('span');
        oldSpan.className = 'old-price';
        oldSpan.style.opacity = '0.5';
        oldSpan.textContent = `₪${price}`;

        const newSpan = document.createElement('span');
        newSpan.className = 'Price new-price';
        newSpan.textContent = `₪${salePrice}`;

        priceDiv.appendChild(oldSpan);
        priceDiv.appendChild(newSpan);
    } else {
        const priceSpan = document.createElement('span');
        priceSpan.className = 'Price new-price';
        priceSpan.textContent = `₪${price}`;
        priceDiv.appendChild(priceSpan);
    }

    // Actions
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'p-actions';

    const addBtn = document.createElement('button');
    addBtn.className = 'add-to-cart AddToCart';
    addBtn.textContent = 'הוסף לסל';
    addBtn.addEventListener('click', () => {
        if (typeof AddCartItem === 'function') {
            AddCartItem(name, id, activePrice, imageUrl);
        }
    });

    const heart = document.createElement('i');
    heart.className = `fa-heart wishlist-heart ${isWishlisted ? 'fa-solid filled' : 'fa-regular outline'}`;
    heart.dataset.id = id;
    heart.addEventListener('click', function () {
        toggleWishlist(this, {
            id, name, price, img: imageUrl, category: Category, onsale: isOnSale, saleprice: salePrice
        });
    });

    actionsDiv.appendChild(addBtn);
    actionsDiv.appendChild(heart);

    infoDiv.appendChild(h1);
    infoDiv.appendChild(descP);
    infoDiv.appendChild(priceDiv);
    infoDiv.appendChild(actionsDiv);

    container.appendChild(imgDiv);
    container.appendChild(infoDiv);
}

/* ==========================================
   2. RELATED PRODUCTS LOGIC
   ========================================== */
function renderRelatedProducts(currentProduct) {
    const container = document.getElementById('RelatedProductsList');
    const section = document.querySelector('.related-products-section');
    if (!container) return;

    container.replaceChildren();

    const rawCatalog = JSON.parse(localStorage.getItem('allProductsCatalog')) || [];
    if (!rawCatalog || rawCatalog.length === 0) {
        if (section) section.style.display = 'none';
        return;
    }

    const normalizedCatalog = rawCatalog.map(item => {
        const fields = item.fields || item;
        const price = Number(fields.price || 0);
        const isOnSale = fields.onsale === true || fields.onSale === true;
        const salePrice = fields.saleprice || fields.salePrice || price;

        return {
            id: String(fields.id || item.sys?.id || ''),
            name: fields.name || fields.title || 'מוצר',
            price: price,
            saleprice: salePrice,
            onsale: isOnSale,
            activePrice: isOnSale ? salePrice : price,
            category: extractCategoryName(fields.category || fields.Category),
            about: fields.about || fields.name || '',
            img: formatImageUrl(fields.pic || fields.img || fields.image)
        };
    });

    const currentCategory = extractCategoryName(currentProduct.category).toLowerCase().trim();
    const currentId = String(currentProduct.id || '');

    let relatedItems = normalizedCatalog.filter(item => {
        return item.category.toLowerCase().trim() === currentCategory && item.id !== currentId;
    });

    if (relatedItems.length === 0) {
        relatedItems = normalizedCatalog.filter(item => item.id !== currentId);
    }

    if (relatedItems.length === 0) {
        if (section) section.style.display = 'none';
        return;
    }

    if (section) section.style.display = 'block';

    const fragment = document.createDocumentFragment();

    relatedItems.slice(0, 4).forEach(item => {
        if (typeof createProductCard === 'function') {
            fragment.appendChild(createProductCard(item));
        }
    });

    container.appendChild(fragment);
    syncHeartIcons();
}

/* ==========================================
   3. WISHLIST HELPERS
   ========================================== */
window.toggleWishlist = function(element, product) {
    if (!product || !product.id) return;

    let wishlist = JSON.parse(localStorage.getItem('wishlist')) || [];
    const existingIndex = wishlist.findIndex(item => String(item.id) === String(product.id));

    if (existingIndex > -1) {
        wishlist.splice(existingIndex, 1);
        element.classList.remove('filled', 'fa-solid');
        element.classList.add('outline', 'fa-regular');
    } else {
        wishlist.push(product);
        element.classList.remove('outline', 'fa-regular');
        element.classList.add('filled', 'fa-solid');
    }

    localStorage.setItem('wishlist', JSON.stringify(wishlist));
    updateWishlistBadge();
};

function syncHeartIcons() {
    const wishlist = JSON.parse(localStorage.getItem('wishlist')) || [];
    document.querySelectorAll('.wishlist-heart').forEach(heart => {
        const productId = heart.dataset.id;
        if (!productId) return;

        const existsInWishlist = wishlist.some(item => String(item.id) === String(productId));
        if (existsInWishlist) {
            heart.classList.remove('outline', 'fa-regular');
            heart.classList.add('filled', 'fa-solid');
        } else {
            heart.classList.remove('filled', 'fa-solid');
            heart.classList.add('outline', 'fa-regular');
        }
    });
}

function updateWishlistBadge() {
    const wishlist = JSON.parse(localStorage.getItem('wishlist')) || [];
    const wishlistBadge = document.querySelector('.wishlist-icon .badge');
    if (wishlistBadge) {
        wishlistBadge.textContent = wishlist.length;
    }
}