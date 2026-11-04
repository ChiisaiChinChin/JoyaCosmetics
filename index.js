// Initialize Contentful Client
const client = contentful.createClient({
    space: 'v559p2wzhl5w',
    accessToken: 'RZOFA-Qr_tng7FiHxqvX7qaomtZ8oaJzuasdIZYhgk4'
});

// Global promotional settings (with defaults if API call fails)
let activePromotions = {
    nPlusOneSale: 0,
    freeShipping: 0,
    mysteryGift: 0,
};

// Fetch global store settings from Contentful
async function fetchStoreSettings() {
    try {
        const response = await client.getEntries({
            content_type: 'storeSettings',
            limit: 1
        });

        if (response.items && response.items.length > 0) {
            const fields = response.items[0].fields;
            activePromotions = {
                nPlusOneSale: Number(fields.nPlusOneSale || fields.nPlusOne || 0),
                freeShipping: Number(fields.freeShipping || fields.freeShippingThreshold || 0),
                mysteryGift: Number(fields.mysteryGift || fields.mysteryGiftThreshold || 0),
            };
            console.log("✅ Store settings loaded from Contentful:", activePromotions);

            initPromoStrip();

            // 👉 ADD THIS LINE SO THE CART UPDATES AUTOMATICALLY ONCE SETTINGS LOAD
            if (typeof renderCart === 'function') {
                renderCart();
            }
        }
    } catch (error) {
        console.warn("⚠️ Could not load store settings from Contentful, using default values.", error);
    }
}

// טעינה והרצה של פס המבצעים הנע
function initPromoStrip() {
    const container = document.getElementById('promoStripTrack');
    const wrapper = document.querySelector('.promo-strip-container'); // המעטפת החיצונית
    if (!container || !wrapper) return;

    let promoMessages = [];

    // 1. אוספים את כל המבצעים הפעילים
    if (activePromotions.nPlusOneSale > 0) {
        promoMessages.push(`🎁 מבצע מיוחד! קני ${activePromotions.nPlusOneSale} מוצרים וקבלו מוצר במתנה! (04/11/2026 - 30/12/2026`);
    }
    if (activePromotions.freeShipping > 0) {
        promoMessages.push(`🚚 משלוח חינם בקנייה מעל ₪${activePromotions.freeShipping}!`);
    }
    if (activePromotions.mysteryGift > 0) {
        promoMessages.push(`✨ מתנה מפתיעה בכל קנייה מעל ${activePromotions.mysteryGift} מוצרים! (04/11/2026 - 30/12/2026)`);
    }

    // 2. אם אין אף מבצע פעיל - הסתר לחלוטין את הפס העליון
    if (promoMessages.length === 0) {
        wrapper.style.display = 'none';
        return;
    }

    // אם יש מבצעים, ודא שהפס מוצג
    wrapper.style.display = 'flex';

    // 3. יצירת אלמנטי ה-HTML
    const itemsHTML = promoMessages.map(msg => `
        <div class="promo-strip-item">
            <span>${msg}</span>
        </div>
    `).join('');

    // 4. תמיד מכפילים פי 3 כדי לשמור על האנימציה האופקית האינסופית והחלקה
    container.innerHTML = itemsHTML + itemsHTML + itemsHTML;
}

var allProducts = [];
let wishlist = getWishlist();
var currentPath = "";

/* ==========================================
   1. HELPER & DATA NORMALIZATION FUNCTIONS
   ========================================== */
function normalizeProduct(item) {
    const fields = item.fields || item;
    const sysId = item.sys?.id || '';
    const id = fields.id || sysId;
    const price = Number(fields.price || 0);
    const isOnSale = fields.onSale === true || fields.onsale === true;
    const salePrice = fields.salePrice !== undefined ? Number(fields.salePrice) : (fields.saleprice ? Number(fields.saleprice) : price);

    return {
        id: String(id),
        name: fields.name || fields.title || 'מוצר',
        price: price,
        saleprice: salePrice,
        onsale: isOnSale,
        activePrice: isOnSale ? salePrice : price,
        category: extractCategoryName(fields.category || fields.Category),
        about: fields.about || fields.name || fields.title || 'מוצר',
        img: getImageUrl(item)
    };
}

function extractCategoryName(cat) {
    if (!cat) return 'Product';
    if (typeof cat === 'object') {
        return cat.fields?.title || cat.fields?.name || cat.sys?.id || 'Product';
    }
    return String(cat).trim();
}

function getWishlist() {
    try {
        return JSON.parse(localStorage.getItem('wishlist')) || [];
    } catch (e) {
        return [];
    }
}

function getImageUrl(item) {
    const fields = item.fields || item;
    if (fields.pic?.fields?.file?.url) {
        return fields.pic.fields.file.url.startsWith('//') ? `https:${fields.pic.fields.file.url}` : fields.pic.fields.file.url;
    }
    if (fields.pic?.file?.url) {
        return fields.pic.file.url.startsWith('//') ? `https:${fields.pic.file.url}` : fields.pic.file.url;
    }
    if (typeof fields.pic === 'string' && fields.pic.trim() !== '') {
        return fields.pic;
    }
    return fields.img || fields.image || 'Pictures/placeholder.png';
}

/* ==========================================
   2. CONTENTFUL API FETCHING
   ========================================== */
async function fetchProducts() {
    try {
        const response = await client.getEntries({ content_type: 'product' });

        if (response.items && response.items.length > 0) {
            allProducts = response.items;
            localStorage.setItem('allProductsCatalog', JSON.stringify(allProducts));
            syncCartWithContentful(response.items);
            displayProducts(response.items);
        } else {
            console.warn("⚠️ Contentful connected, but returned 0 items!");
        }
    } catch (error) {
        console.error("❌ Contentful Connection Error:", error);
    }
}

async function loadCategoryProducts(targetCategoryOrSub) {
    const container = document.getElementById('productGrid');
    if (!container) {
        console.error("❌ Container element with id='productGrid' not found!");
        return;
    }

    if (!targetCategoryOrSub || String(targetCategoryOrSub).trim() === '') {
        console.warn("⚠️ No target category/subcategory specified.");
        container.innerHTML = '<p class="no-products">לא נמצאו מוצרים בקטגוריה זו.</p>';
        return;
    }

    const cleanTarget = String(targetCategoryOrSub).trim().toLowerCase();

    let rawCatalog = JSON.parse(localStorage.getItem('allProductsCatalog')) || [];

    // Fetch from Contentful if cache is empty
    if ((!rawCatalog || rawCatalog.length === 0) && typeof client !== 'undefined') {
        try {
            const response = await client.getEntries({
                content_type: 'product',
                include: 2
            });
            rawCatalog = response.items || [];
            if (rawCatalog.length > 0) {
                localStorage.setItem('allProductsCatalog', JSON.stringify(rawCatalog));
            }
        } catch (err) {
            console.error("Error fetching products from Contentful:", err);
        }
    }

    if (!rawCatalog || rawCatalog.length === 0) {
        container.innerHTML = '<p class="no-products">לא נמצאו מוצרים.</p>';
        return;
    }

    // Helper to check if a single field/array matches cleanTarget
    const matchesValue = (fieldVal) => {
        if (!fieldVal) return false;
        if (Array.isArray(fieldVal)) {
            return fieldVal.some(val => String(val).trim().toLowerCase() === cleanTarget);
        }
        return String(fieldVal)
            .split(',')
            .map(s => s.trim().toLowerCase())
            .filter(s => s.length > 0)
            .includes(cleanTarget);
    };

    // Filter product if cleanTarget matches EITHER category OR subCategory
    const matchingProducts = rawCatalog.filter(rawItem => {
        const fields = rawItem.fields || rawItem;

        const cat = fields.category || fields.Category;
        const subCat = fields.subCategory || fields.subcategory || fields.SubCategory;

        // Returns true if either category or subCategory matches the target string
        return matchesValue(cat) || matchesValue(subCat);
    });

    if (matchingProducts.length === 0) {
        container.innerHTML = '<p class="no-products">לא נמצאו מוצרים בקטגוריה זו.</p>';
        return;
    }

    const wishlist = JSON.parse(localStorage.getItem('wishlist')) || [];

    container.innerHTML = matchingProducts.map(rawItem => {
        const fields = rawItem.fields || rawItem;

        const id = fields.id || rawItem.sys?.id || '';
        const name = fields.name || fields.title || 'מוצר';
        const price = fields.price || 0;
        const isOnSale = fields.onsale === true || fields.onSale === true;
        const salePrice = (fields.saleprice !== undefined && fields.saleprice !== "") ? fields.saleprice : price;
        const activePrice = isOnSale ? salePrice : price;
        const about = fields.about || name;

        const categoryDisplay = Array.isArray(fields.category) ? fields.category.join(', ') : (fields.category || targetCategoryOrSub);
        const subCategoryDisplay = fields.subCategory || fields.subcategory || '';
        const imageUrl = getImageUrl(rawItem);

        const safeTitle = String(name).replace(/'/g, "\\'");
        const safeName = String(about).replace(/'/g, "\\'");

        const isWishlisted = wishlist.some(w => String(w.id) === String(id));
        const heartIconClass = isWishlisted ? 'fa-solid filled' : 'fa-regular outline';

        const itemPayload = {
            id: id,
            name: name,
            price: price,
            saleprice: salePrice,
            onsale: isOnSale,
            category: fields.category || targetCategoryOrSub,
            subCategory: subCategoryDisplay,
            about: about,
            img: imageUrl
        };
        const safeItemJSON = JSON.stringify(itemPayload).replace(/'/g, "&apos;").replace(/"/g, "&quot;");

        let priceHTML = `<div class="p-price"><span class="Price new-price">₪${price}</span></div>`;
        if (isOnSale) {
            priceHTML = `
                <div class="p-price">
                    <span class="old-price">₪${price}</span>
                    <span class="Price new-price">₪${salePrice}</span>
                </div>
            `;
        }

        return `
            <li>
                <div class="product-card" id="${id}">
                    <div class="product-image">
                        <img class="ProductImg" 
                             onclick='goToProductPage(${safeItemJSON})' 
                             alt="${categoryDisplay}" 
                             src="${imageUrl}" />
                    </div>
                    <div class="product-info">
                        <p class="p-name About" onclick='goToProductPage(${safeItemJSON})'>${safeName}</p>
                        <p class="p-category AboutInv">${subCategoryDisplay ? `${categoryDisplay} - ${subCategoryDisplay}` : categoryDisplay}</p>

                        ${priceHTML}

                        <div class="p-actions">
                            <button class="add-to-cart AddToCart" name="${id}" onclick="AddCartItem('${safeTitle}', '${id}', '${activePrice}', '${imageUrl}')">
                                הוסף לסל
                            </button>
                            <i class="fa-heart wishlist-heart ${heartIconClass}" 
                               data-id="${id}" 
                               onclick="toggleWishlist(this, { id: '${id}', name: '${safeTitle}', price: ${price}, img: '${imageUrl}', category: '${categoryDisplay}', onsale: ${isOnSale}, saleprice: '${salePrice}' })">
                            </i>
                        </div>
                    </div>
                </div>
            </li>
        `;
    }).join('');
}

function syncCartWithContentful(fetchedProducts) {
    let cart = getCart();
    if (!cart || cart.length === 0) return;

    let updated = false;

    cart.forEach(cartItem => {
        const matchedProduct = fetchedProducts.find(p => {
            const sysId = p.sys && p.sys.id;
            const fieldId = p.fields && p.fields.id;
            return String(sysId) === String(cartItem.id) || String(fieldId) === String(cartItem.id);
        });

        if (matchedProduct) {
            const norm = normalizeProduct(matchedProduct);
            if (Number(cartItem.price) !== norm.activePrice) {
                cartItem.price = norm.activePrice;
                updated = true;
            }
        }
    });

    if (updated) {
        saveCart(cart);
        renderCart();
    }
}


function displayProducts(products) {
    const container = document.getElementById('ItemsList');
    if (!container) return;

    container.replaceChildren();

    if (!Array.isArray(products) || products.length === 0) {
        const msg = document.createElement("p");
        msg.className = "no-products";
        msg.textContent = "אין מוצרים זמינים כרגע.";
        container.appendChild(msg);
        return;
    }

    const targetCategory = container.getAttribute('data-category');
    const isSalePage = container.getAttribute('data-sale') === "true";

    let filtered = products.map(p => p.fields ? normalizeProduct(p) : p);

    if (targetCategory) {
        filtered = filtered.filter(item => item.category === targetCategory);
    }
    if (isSalePage) {
        filtered = filtered.filter(item => item.onsale);
    }

    if (filtered.length === 0) {
        const msg = document.createElement("p");
        msg.className = "no-products";
        msg.textContent = isSalePage ? "אין מוצרים במבצע כרגע." : "אין מוצרים זמינים בקטגוריה זו כרגע.";
        container.appendChild(msg);
        return;
    }

    const fragment = document.createDocumentFragment();
    filtered.forEach(item => {
        fragment.appendChild(createProductCard(item));
    });

    container.appendChild(fragment);
    syncHeartIcons();
}

/* ==========================================
   9. CAROUSELS & BANNERS LOGIC
   ========================================== */
const carouselStates = {
    mainHeroCarousel: 0,
    dualBannersCarousel: 0
};

window.moveSlide = function (carouselId, direction) {
    const carousel = document.getElementById(carouselId);
    if (!carousel) return;

    const slides = carousel.querySelectorAll('.carousel-slide');
    const totalSlides = slides.length;
    if (totalSlides === 0) return;

    let currentIndex = carouselStates[carouselId] || 0;
    currentIndex = (currentIndex + direction + totalSlides) % totalSlides;

    goToSlide(carouselId, currentIndex);
};

function goToSlide(carouselId, slideIndex) {
    const carousel = document.getElementById(carouselId);
    if (!carousel) return;

    const track = carousel.querySelector('.carousel-track');
    const slides = carousel.querySelectorAll('.carousel-slide');
    const dots = carousel.querySelectorAll('.carousel-dots .dot');

    if (!track || slides.length === 0) return;

    if (slideIndex < 0 || slideIndex >= slides.length) return;

    carouselStates[carouselId] = slideIndex;
    track.style.transform = `translateX(${slideIndex * 100}%)`;

    slides.forEach((slide, idx) => {
        slide.classList.toggle('active', idx === slideIndex);
    });

    dots.forEach((dot, idx) => {
        dot.classList.toggle('active', idx === slideIndex);
    });
}

setInterval(() => {
    moveSlide('mainHeroCarousel', 1);
}, 5500);

setInterval(() => {
    moveSlide('dualBannersCarousel', 1);
}, 4500);

// Hero Banners
let bannerItems = [];
let currentIndex = 0;

async function loadHeroBanners() {
    try {
        const response = await client.getEntries({
            content_type: 'banners'
        });

        if (!response.items || response.items.length === 0) return;

        bannerItems = response.items;
        updateBannerDisplay(currentIndex);
        renderDots();
    } catch (err) {
        console.error("Error loading banners:", err);
    }
}

function updateBannerDisplay(index) {
    if (!bannerItems[index]) return;

    const fields = bannerItems[index].fields;

    const imgUrl = fields.image?.fields?.file?.url
        ? `https:${fields.image.fields.file.url}`
        : (fields.pic?.fields?.file?.url ? `https:${fields.pic.fields.file.url}` : '');

    const img = document.getElementById('bannerImage');
    const title = document.getElementById('bannerTitle');
    const sub = document.getElementById('bannerSubtitle');
    const btn = document.getElementById('bannerBtn');

    if (img) img.src = imgUrl || "#";
    if (title) title.innerText = fields.header || 'ONLY YOU';
    if (sub) sub.innerText = fields.text || 'הנחה על כל סדרת 20% ONLY YOU';

    if (btn) {
        btn.href = fields.linkUrl || fields.targetPage || 'SalePage.html';
        btn.innerText = fields.buttonText || 'קנה עכשיו';
    }
}

function renderDots() {
    const dotsContainer = document.getElementById('carouselDots');
    if (!dotsContainer) return;

    dotsContainer.innerHTML = bannerItems.map((_, idx) => `
        <span class="dot ${idx === currentIndex ? 'active' : ''}" onclick="goToBanner(${idx})"></span>
    `).join('');
}

window.moveBanner = function (direction) {
    currentIndex = (currentIndex + direction + bannerItems.length) % bannerItems.length;
    updateBannerDisplay(currentIndex);
    renderDots();
};

window.goToBanner = function (index) {
    currentIndex = index;
    updateBannerDisplay(currentIndex);
    renderDots();
};

// Dual Banners
const dualBannersData = [
    { img: 'Banners/PishtanBanner.png', alt: 'Banner 1', page: 'Pishtan.html' },
    { img: 'Banners/HemphaBanner.png', alt: 'Banner 2', page: 'Hempha.html' },
    { img: 'Banners/Coco&Honey Banner.png', alt: 'Banner 3', page: 'Coco&Honey.html' },
    { img: 'Banners/MyCollection Banner.png', alt: 'Banner 4', page: 'MyCollection.html' },
    { img: 'Banners/Keratin Forte Banner.png', alt: 'Banner 5', page: 'KeratinForte.html' },
    { img: 'Banners/Curls Banner.png', alt: 'Banner 6', page: 'Curls.html' }
];

function renderDualBanners(items) {
    const track = document.querySelector('#dualBannersCarousel .carousel-track');
    const dotsContainer = document.querySelector('#dualBannersCarousel .carousel-dots');

    if (!track) {
        console.error("❌ Dual Banners Error: #dualBannersCarousel .carousel-track not found in HTML!");
        return;
    }
    if (!dotsContainer) {
        console.error("❌ Dual Banners Error: #dualBannersCarousel .carousel-dots not found in HTML!");
        return;
    }

    track.innerHTML = '';
    dotsContainer.innerHTML = '';

    const isMobile = window.innerWidth <= 768;
    const itemsPerSlide = isMobile ? 1 : 2;

    let slideIndex = 0;
    for (let i = 0; i < items.length; i += itemsPerSlide) {
        const slideItems = items.slice(i, i + itemsPerSlide);

        const slide = document.createElement('div');
        slide.className = `carousel-slide ${slideIndex === 0 ? 'active' : ''}`;

        const dualContainer = document.createElement('div');
        dualContainer.className = 'dual-banners';

        slideItems.forEach(item => {
            const card = document.createElement('div');
            card.className = 'banner-card';
            card.innerHTML = `<img src="${item.img}" alt="${item.alt}" onclick="window.location.href='${item.page}'">`;
            dualContainer.appendChild(card);
        });

        slide.appendChild(dualContainer);
        track.appendChild(slide);

        const currentIdx = slideIndex;
        const dot = document.createElement('span');
        dot.className = `dot ${currentIdx === 0 ? 'active' : ''}`;
        dot.onclick = () => goToSlide('dualBannersCarousel', currentIdx);
        dotsContainer.appendChild(dot);

        slideIndex++;
    }

    goToSlide('dualBannersCarousel', 0);
}

let resizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        renderDualBanners(dualBannersData);
    }, 250);
});

setInterval(fetchProducts, 1200000);

/* ==========================================
   3. PRODUCT CARD BUILDER & DISPLAY
   ========================================== */
function createProductCard(productData) {
    const norm = productData.fields ? normalizeProduct(productData) : productData;
    const wishlist = getWishlist();
    const isWishlisted = wishlist.some(w => String(w.id) === String(norm.id));

    const li = document.createElement("li");
    const card = document.createElement("div");
    card.className = "product-card";
    card.id = norm.id;

    // Image Container
    const imgDiv = document.createElement("div");
    imgDiv.className = "product-image";
    const img = document.createElement("img");
    img.className = "ProductImg";
    img.alt = norm.category;
    img.src = norm.img || 'Pictures/placeholder.png';
    img.onerror = () => { img.src = 'Pictures/placeholder.png'; };
    img.addEventListener("click", () => goToProductPage(norm));
    imgDiv.appendChild(img);

    // Info Container
    const infoDiv = document.createElement("div");
    infoDiv.className = "product-info";

    const nameP = document.createElement("p");
    nameP.className = "p-name About";
    nameP.textContent = norm.about;
    nameP.addEventListener("click", () => goToProductPage(norm));

    const catP = document.createElement("p");
    catP.className = "p-category AboutInv";
    catP.textContent = norm.category;

    // Price
    const priceDiv = document.createElement("div");
    priceDiv.className = "p-price";

    if (norm.onsale && norm.saleprice !== undefined) {
        const oldSpan = document.createElement("span");
        oldSpan.className = "old-price";
        oldSpan.textContent = `₪${norm.price}`;

        const newSpan = document.createElement("span");
        newSpan.className = "Price new-price";
        newSpan.textContent = `₪${norm.saleprice}`;

        priceDiv.appendChild(oldSpan);
        priceDiv.appendChild(newSpan);
    } else {
        const priceSpan = document.createElement("span");
        priceSpan.className = "Price new-price";
        priceSpan.textContent = `₪${norm.price}`;
        priceDiv.appendChild(priceSpan);
    }

    // Actions
    const actionsDiv = document.createElement("div");
    actionsDiv.className = "p-actions";

    const addBtn = document.createElement("button");
    addBtn.className = "add-to-cart AddToCart";
    addBtn.name = norm.id;
    addBtn.textContent = "הוסף לסל";
    addBtn.addEventListener("click", () => AddCartItem(norm.name, norm.id, norm.activePrice, norm.img));

    const heart = document.createElement("i");
    heart.className = `fa-heart wishlist-heart ${isWishlisted ? 'fa-solid filled' : 'fa-regular outline'}`;
    heart.dataset.id = norm.id;
    heart.addEventListener("click", function () {
        toggleWishlist(this, norm);
    });

    actionsDiv.appendChild(addBtn);
    actionsDiv.appendChild(heart);

    infoDiv.appendChild(nameP);
    infoDiv.appendChild(catP);
    infoDiv.appendChild(priceDiv);
    infoDiv.appendChild(actionsDiv);

    card.appendChild(imgDiv);
    card.appendChild(infoDiv);
    li.appendChild(card);

    return li;
}

function goToProductPage(product) {
    if (!product) return;
    const norm = product.fields ? normalizeProduct(product) : product;
    sessionStorage.setItem('selectedProduct', JSON.stringify(norm));
    window.location.href = `product.html?id=${norm.id}`;
}


/* ==========================================
   4. WISHLIST FUNCTIONS
   ========================================== */
function toggleWishlist(element, product) {
    if (!product || !product.id) return;

    let wishlist = getWishlist();
    const isAdding = element.classList.contains('outline') || element.classList.contains('fa-regular');

    if (isAdding) {
        element.classList.remove('outline', 'fa-regular');
        element.classList.add('filled', 'fa-solid');
        if (!wishlist.some(item => String(item.id) === String(product.id))) {
            wishlist.push(product);
        }
    } else {
        element.classList.remove('filled', 'fa-solid');
        element.classList.add('outline', 'fa-regular');
        wishlist = wishlist.filter(item => String(item.id) !== String(product.id));
    }

    localStorage.setItem('wishlist', JSON.stringify(wishlist));
    updateWishlistBadge();
}

function removeFromWishlist(productId) {
    let wishlist = getWishlist().filter(item => String(item.id) !== String(productId));
    localStorage.setItem('wishlist', JSON.stringify(wishlist));
    updateWishlistBadge();
    renderWishlistPage();
    syncHeartIcons();
}

function updateWishlistBadge() {
    const wishlist = getWishlist();
    const wishlistBadge = document.querySelector('.wishlist-icon .badge');
    if (wishlistBadge) {
        wishlistBadge.textContent = wishlist.length;
    }
}

function syncHeartIcons() {
    const wishlist = getWishlist();
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

function renderWishlistPage() {
    const container = document.getElementById('WishListItems');
    if (!container) return;

    container.replaceChildren();
    const wishlist = getWishlist();

    if (wishlist.length === 0) {
        const li = document.createElement("li");
        li.className = "empty-wishlist-msg";
        li.textContent = "רשימת המשאלות שלך ריקה";
        container.appendChild(li);
        return;
    }

    const fragment = document.createDocumentFragment();
    wishlist.forEach(item => {
        fragment.appendChild(createProductCard(item));
    });
    container.appendChild(fragment);
}

/* ==========================================
   5. SMART SEARCH DICTIONARY & LOGIC
   ========================================== */
const SEARCH_DICTIONARY = {
    "מסכה": ["מסכה", "מסכות", "מסיכה", "מסכת", "הזנה", "mask", "masks", "hair mask"],
    "שמפו": ["שמפו", "חפיפה", "shampoo"],
    "מרכך": ["מרכך", "מרככים", "קונדישנר", "conditioner"],
    "סרום": ["סרום", "סרומים", "serum"],
    "לחות": ["לחות", "קרם", "קרמים", "moisturizer", "cream"],
    "שיער": ["שיער", "שער", "hair"],
    "ארגן": ["ארגן", "argan"],
    "קוקוס": ["קוקוס", "coco", "coconut"],
    "דבש": ["דבש", "honey"],
    "תלתלים": ["מתולתלות", "תלתלים", "מתולתלת", "curls", "curly"],
    "המפה": ["המפה", "hemp"],
    "קרטין": ["קרטין", "keratin"],
    "פשתן": ["פשתן", "flax", "flaxseed"]
};

function getExpandedTokenVariants(token) {
    const clean = token.toLowerCase().trim();
    if (!clean) return [];

    let variants = new Set([clean]);
    for (const [key, list] of Object.entries(SEARCH_DICTIONARY)) {
        if (clean === key || clean.includes(key) || key.includes(clean)) {
            list.forEach(v => variants.add(v.toLowerCase()));
        }
    }
    return Array.from(variants);
}

function isSmartSearchMatch(productText, searchQuery) {
    const cleanProductText = productText.toLowerCase();
    const queryTokens = searchQuery.toLowerCase().trim().split(/\s+/).filter(t => t.length > 0);
    if (queryTokens.length === 0) return true;

    return queryTokens.every(token => {
        const variants = getExpandedTokenVariants(token);
        return variants.some(variant => cleanProductText.includes(variant));
    });
}

window.quickSearch = function (term) {
    const searchInput = document.getElementById("Search");
    if (!searchInput) return;

    if (searchInput.value === term) {
        searchInput.value = '';
    } else {
        searchInput.value = term;
    }
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
};

/* ==========================================
   6. MOBILE MENU, SWIPE GESTURES & NAVIGATION
   ========================================== */

function PageLoaded() {
    CloseCart();
    updateWishlistBadge();
    renderWishlistPage();
    syncHeartIcons();

    let cart = getCart();
    let totalQty = cart.reduce((sum, item) => sum + (item.quantity || item.qty || 1), 0);
    localStorage.setItem("OpCartQ", totalQty);
    updateCartQuantity(totalQty);
    renderCart();
}


window.toggleMenu = function () {
    const sideMenu = document.getElementById("sideMenu");
    const menuOverlay = document.getElementById("menuOverlay");

    if (sideMenu) sideMenu.classList.toggle('active');
    if (menuOverlay) menuOverlay.classList.toggle('active');
    document.body.classList.toggle('no-scroll');
};

window.toggleDropdown = function (element) {
    const parentLi = element.closest('li.has-dropdown');
    if (parentLi) {
        parentLi.classList.toggle('active');
    }
};

/* ==========================================
   7. CART & STORAGE HELPERS
   ========================================== */
function AddCartItem(name, id, price, src) {
    OpenCart();
    addToCart(name, id, price, src);
}

window.CloseCart = function () {
    const Cart = document.getElementById("Cart");
    if (Cart) {
        Cart.classList.remove('active');
        document.body.classList.remove('no-scroll');
    }
};

window.OpenCart = function () {
    const Cart = document.getElementById("Cart");
    if (Cart) {
        Cart.classList.add('active');
        document.body.classList.add('no-scroll');
    }
};

document.addEventListener('DOMContentLoaded', async () => {
    // 1. אתחול עגלה ונתוני בסיס
    PageLoaded();

    // 2. טעינת נתונים מ-Contentful (הגדרות חנות + פס מבצעים)
    await fetchStoreSettings();

    // 3. טעינת באנרים ראשיים ומוצרים
    await loadHeroBanners();
    await fetchProducts();

    // 4. טעינת הבאנרים הכפולים
    if (typeof dualBannersData !== 'undefined') {
        renderDualBanners(dualBannersData);
    } else {
        console.error("❌ dualBannersData is not defined!");
    }

    // 2. Initialize UI states on page load / refresh
    updateWishlistBadge();
    renderWishlistPage();
    syncHeartIcons();

    let cart = getCart();
    let totalQty = cart.reduce((sum, item) => sum + (item.quantity || item.qty || 1), 0);
    localStorage.setItem("OpCartQ", totalQty);
    updateCartQuantity(totalQty);
    renderCart();

    // Backdrop click listener for modal
    document.querySelectorAll('#Cart, .cart-modal').forEach(cart => {
        cart.addEventListener('click', (event) => {
            if (event.target === cart) {
                CloseCart();
                window.location.reload();
            }
        });
    });
});

function updateCartQuantity(newQuantity) {
    const badge = document.querySelector('.icon-btn .badge');
    const opQuantity = document.getElementById('OpQuantity');
    const qty = newQuantity || 0;
    if (badge) badge.textContent = qty;
    if (opQuantity) opQuantity.textContent = qty;
}

function getCart() {
    try {
        const storedCart = localStorage.getItem("shopping_cart") || localStorage.getItem("cart");
        if (!storedCart || storedCart === "undefined" || storedCart === "null") return [];
        return JSON.parse(storedCart) || [];
    } catch (error) {
        return [];
    }
}

function saveCart(cart) {
    const normalizedCart = cart.map(item => {
        const q = Math.max(1, parseInt(item.quantity || item.qty || 1, 10));
        return {
            ...item,
            quantity: q,
            qty: q
        };
    });

    localStorage.setItem("shopping_cart", JSON.stringify(normalizedCart));
    localStorage.setItem("cart", JSON.stringify(normalizedCart));

    const totalQty = normalizedCart.reduce((sum, item) => sum + item.quantity, 0);
    localStorage.setItem("OpCartQ", totalQty);
    updateCartQuantity(totalQty);
}

function addToCart(name, id, price, src) {
    let cart = getCart();
    const existingItem = cart.find(item => String(item.id) === String(id));

    if (existingItem) {
        const newQty = (existingItem.quantity || existingItem.qty || 1) + 1;
        existingItem.quantity = newQty;
        existingItem.qty = newQty;
        existingItem.price = Number(price);
    } else {
        cart.push({
            id: String(id),
            name: name,
            title: name,
            price: Number(price),
            src: src,
            image: src,
            quantity: 1,
            qty: 1
        });
    }

    saveCart(cart);
    renderCart();
}

/* ==========================================
   8. CART CALCULATION HELPER
   ========================================== */
function getCartCalculation() {
    const cart = getCart();
    let totalCartSum = 0;
    let qtyOVERall = 0;

    let allUnits = [];
    cart.forEach(cartItem => {
        const itemQty = Number(cartItem.quantity || cartItem.qty || 1);
        qtyOVERall += itemQty;
        for (let i = 0; i < itemQty; i++) {
            allUnits.push({
                id: cartItem.id,
                name: cartItem.name || cartItem.title,
                price: Number(cartItem.price),
                src: cartItem.src || cartItem.image
            });
        }
    });

    allUnits.sort((a, b) => a.price - b.price);

    let freeItemsCount = 0;
    let hasMysteryGift = false;

    if (activePromotions.mysteryGift !== 0 && qtyOVERall >= activePromotions.mysteryGift) {
        hasMysteryGift = true;
    }

    if (activePromotions.nPlusOneSale !== 0 && qtyOVERall >= activePromotions.nPlusOneSale) {
        freeItemsCount = 1;
    }

    let freeUnits = allUnits.slice(0, freeItemsCount);
    let paidUnits = allUnits.slice(freeItemsCount);

    paidUnits.forEach(u => totalCartSum += u.price);

    const mysteryGiftItem = hasMysteryGift ? {
        id: 'mystery-gift',
        name: 'מתנה מפתיעה (Mystery Gift)',
        price: 0,
        src: 'Pictures/placeholder.png',
        isMystery: true
    } : null;

    return {
        cart,
        totalCartSum,
        qtyOVERall,
        freeUnits,
        paidUnits,
        mysteryGiftItem,
        freeShippingThreshold: activePromotions.freeShipping
    };
}

/* ==========================================
   9. RENDER CART WITH HINTS & PROMOS
   ========================================== */
function renderCart() {
    const CartUl = document.getElementById("CartItems");
    const OverAll = document.getElementById("Cost");

    if (CartUl) CartUl.replaceChildren();

    const { cart, totalCartSum, qtyOVERall, freeUnits, paidUnits, mysteryGiftItem } = getCartCalculation();

    let paidMap = {};
    paidUnits.forEach(u => {
        if (!paidMap[u.id]) {
            paidMap[u.id] = { id: u.id, name: u.name, price: u.price, src: u.src, qty: 0 };
        }
        paidMap[u.id].qty++;
    });

    let freeMap = {};
    freeUnits.forEach(u => {
        if (!freeMap[u.id]) {
            freeMap[u.id] = { id: u.id, name: u.name, price: u.price, src: u.src, qty: 0 };
        }
        freeMap[u.id].qty++;
    });

    // 1. Render regular paid cart items
    Object.values(paidMap).forEach(item => {
        const li = document.createElement("li");
        li.className = "cart-item";

        const img = document.createElement("img");
        img.src = item.src || 'Pictures/placeholder.png';
        img.className = "cart-item-img";

        const detailsContainer = document.createElement("div");
        detailsContainer.className = "cart-item-details";

        const Pname = document.createElement("p");
        Pname.className = "cart-item-name";
        Pname.textContent = item.name;

        const Pprice = document.createElement("p");
        Pprice.className = "cart-item-price";
        Pprice.textContent = `${item.qty} x ₪${item.price} = ₪${item.qty * item.price}`;

        detailsContainer.appendChild(Pname);
        detailsContainer.appendChild(Pprice);

        const controlsColumn = document.createElement("div");
        controlsColumn.className = "item-controls-column";

        const Plus = document.createElement("button");
        Plus.textContent = "+";
        Plus.className = "cart-btn";

        const Quantity = document.createElement("p");
        Quantity.className = "cart-item-qty-text";
        Quantity.textContent = getCartItemTotalQty(item.id);

        const Minus = document.createElement("button");
        Minus.textContent = "-";
        Minus.className = "cart-btn";

        controlsColumn.appendChild(Plus);
        controlsColumn.appendChild(Quantity);
        controlsColumn.appendChild(Minus);

        li.appendChild(img);
        li.appendChild(detailsContainer);
        li.appendChild(controlsColumn);

        Minus.addEventListener("click", () => updateItemQuantity(item.id, -1));
        Plus.addEventListener("click", () => updateItemQuantity(item.id, 1));

        if (CartUl) CartUl.appendChild(li);
    });

    // 2. Render Free Gift item lines (from cart)
    Object.values(freeMap).forEach(gift => {
        const li = document.createElement("li");
        li.className = "cart-item gift-item";
        li.style.backgroundColor = "#f0f9f4";

        const img = document.createElement("img");
        img.src = gift.src || 'Pictures/placeholder.png';
        img.className = "cart-item-img";

        const detailsContainer = document.createElement("div");
        detailsContainer.className = "cart-item-details";

        const Pname = document.createElement("p");
        Pname.className = "cart-item-name";
        const saleCount = activePromotions.nPlusOneSale > 0 ? activePromotions.nPlusOneSale - 1 : 5;
        Pname.innerHTML = `<span style="color: #27ae60; font-weight: bold;">🎁 מוצר מתנה (מבצע ${saleCount}+1):</span> ${gift.name}`;

        const Pprice = document.createElement("p");
        Pprice.className = "cart-item-price";
        Pprice.innerHTML = `<span style="text-decoration: line-through; color: #888;">₪${gift.price}</span> <strong style="color: #27ae60;">₪0</strong>`;

        detailsContainer.appendChild(Pname);
        detailsContainer.appendChild(Pprice);

        const controlsColumn = document.createElement("div");
        controlsColumn.className = "item-controls-column";

        const giftQtyLabel = document.createElement("p");
        giftQtyLabel.className = "cart-item-qty-text";
        giftQtyLabel.textContent = `${gift.qty} יח'`;
        controlsColumn.appendChild(giftQtyLabel);

        li.appendChild(img);
        li.appendChild(detailsContainer);
        li.appendChild(controlsColumn);

        if (CartUl) CartUl.appendChild(li);
    });

    // 3. Render Mystery Gift line
    if (mysteryGiftItem) {
        const li = document.createElement("li");
        li.className = "cart-item gift-item mystery-gift-item";
        li.style.backgroundColor = "#fef9e7";

        const img = document.createElement("img");
        img.src = "";
        img.className = "cart-item-img";
        img.style.display = "none";

        const detailsContainer = document.createElement("div");
        detailsContainer.className = "cart-item-details";

        const Pname = document.createElement("p");
        Pname.className = "cart-item-name";
        Pname.innerHTML = `<span style="color: #d4ac0d; font-weight: bold;">🎁 מתנה מפתיעה מג'ויה:</span> מוצר הפתעה בלעדי!`;

        const Pprice = document.createElement("p");
        Pprice.className = "cart-item-price";
        Pprice.innerHTML = `<strong style="color: #27ae60;">₪0</strong>`;

        detailsContainer.appendChild(Pname);
        detailsContainer.appendChild(Pprice);

        const controlsColumn = document.createElement("div");
        controlsColumn.className = "item-controls-column";

        const giftQtyLabel = document.createElement("p");
        giftQtyLabel.className = "cart-item-qty-text";
        giftQtyLabel.textContent = `1 יח'`;
        controlsColumn.appendChild(giftQtyLabel);

        li.appendChild(img);
        li.appendChild(detailsContainer);
        li.appendChild(controlsColumn);

        if (CartUl) CartUl.appendChild(li);
    }

    if (OverAll) {
        OverAll.textContent = `סך הכל: ₪${totalCartSum.toFixed(2)}`;
    }

    // Dynamic Hints Footer Update
    const promoNoticeElement = document.getElementById("cartPromoNotice");
    if (promoNoticeElement) {
        const nPlusThreshold = activePromotions.nPlusOneSale || 0;
        const mysteryThreshold = activePromotions.mysteryGift || 0;
        const freeShippingThreshold = activePromotions.freeShipping || 0;

        let hints = [];

        if (mysteryThreshold > 0 && qtyOVERall >= mysteryThreshold) {
            hints.push("🎁 זכית במבצע ובמתנה מפתיעה בלעדית!");
        } else if (nPlusThreshold > 0 && qtyOVERall >= nPlusThreshold) {
            const itemsUntilMystery = mysteryThreshold - qtyOVERall;
            if (mysteryThreshold > 0 && itemsUntilMystery > 0) {
                hints.push(`🎁 זכית במבצע! הוסף עוד ${itemsUntilMystery} מוצרים לקבלת מתנה מפתיעה.`);
            } else {
                hints.push("🎁 זכית במוצר מתנה במבצע!");
            }
        } else if (nPlusThreshold > 0) {
            const itemsUntilPromo = nPlusThreshold - qtyOVERall;
            hints.push(`🛍️ הוסף עוד ${itemsUntilPromo} מוצרים לסל כדי לקבל מוצר מתנה!`);
        }

        if (freeShippingThreshold > 0) {
            if (totalCartSum >= freeShippingThreshold) {
                hints.push("🚚 זכית במשלוח חינם!");
            } else {
                const amountNeeded = (freeShippingThreshold - totalCartSum).toFixed(2);
                hints.push(`🚚 הוסף עוד ₪${amountNeeded} לסל כדי לקבל משלוח חינם!`);
            }
        }

        promoNoticeElement.innerHTML = hints.join("<br>");
    }
}

function getCartItemTotalQty(id) {
    const cart = getCart();
    const found = cart.find(i => String(i.id) === String(id));
    return found ? (found.quantity || found.qty || 1) : 0;
}

function updateItemQuantity(id, change) {
    let currentCart = getCart();
    let foundItem = currentCart.find(i => String(i.id) === String(id));
    if (foundItem) {
        let currentQty = (foundItem.quantity || foundItem.qty || 1) + change;
        if (currentQty <= 0) {
            currentCart = currentCart.filter(i => String(i.id) !== String(id));
        } else {
            foundItem.quantity = currentQty;
            foundItem.qty = currentQty;
        }
        saveCart(currentCart);
        renderCart();
    }
}

/* ==========================================
   10. CHECKOUT PAGE MODULE (Namespaced)
   ========================================== */
window.JoyaCheckout = {
    settings: {
        freeShippingThreshold: 250.00,
        baseDeliveryFee: 35.00,
        nPlusOneSaleQty: 0,
        mysteryGiftQty: 0
    },

    init: async function() {
        await this.fetchSettings();
        this.renderSummary();
    },

    fetchSettings: async function() {
        try {
            const response = await client.getEntries({
                content_type: 'storeSettings',
                limit: 1,
                order: '-sys.updatedAt'
            });
            if (response.items && response.items.length > 0) {
                const fields = response.items[0].fields;
                this.settings.freeShippingThreshold = Number(fields.freeShipping || 250.00);
                this.settings.nPlusOneSaleQty = Number(fields.nPlusOneSale || fields.nPlusOne || 0);
                this.settings.mysteryGiftQty = Number(fields.mysteryGift || fields.mysteryGiftThreshold || 0);
            }
        } catch (err) {
            console.warn("Could not fetch store settings, using defaults", err);
        }
    },

    renderSummary: function() {
        const container = document.getElementById('checkoutItems');
        const subtotalElement = document.getElementById('modalSubtotal');
        const deliveryElement = document.getElementById('modalDelivery');
        const totalElement = document.getElementById('modalTotal');
        const promoNotice = document.getElementById('promoNotice');

        if (!container) return;

        const rawCart = getCart();

        if (!rawCart || rawCart.length === 0) {
            container.innerHTML = `
        <div style="text-align:center; padding: 20px; color: #721c24; background-color: #f8d7da; border-radius: 8px; margin: 10px 0;">
          <strong>העגלה שלך ריקה</strong>
          <p style="margin-top: 5px; font-size: 0.85rem;">לא נמצאו מוצרים בזיכרון הדפדפן (localStorage)</p>
        </div>`;
            if (subtotalElement) subtotalElement.textContent = '₪0.00';
            if (deliveryElement) deliveryElement.textContent = '₪0.00';
            if (totalElement) totalElement.textContent = '₪0.00';
            return;
        }

        let totalCartSum = 0;
        let qtyOverall = 0;
        let allUnits = [];

        rawCart.forEach((item, index) => {
            const qty = Number(item.quantity || item.qty || item.count || 1);
            const price = Number(item.price || item.cost || item.unitPrice || 0);
            const name = item.name || item.title || item.productName || `מוצר #${index + 1}`;
            const id = item.id || item._id || name;

            qtyOverall += qty;
            for (let i = 0; i < qty; i++) {
                allUnits.push({ id, name, price });
            }
        });

        allUnits.sort((a, b) => a.price - b.price);

        let freeItemsCount = 0;
        let hasMysteryGift = false;

        if (this.settings.mysteryGiftQty > 0 && qtyOverall >= this.settings.mysteryGiftQty) {
            if (this.settings.nPlusOneSaleQty > 0) freeItemsCount = 1;
            hasMysteryGift = true;
        } else if (this.settings.nPlusOneSaleQty > 0 && qtyOverall >= this.settings.nPlusOneSaleQty) {
            freeItemsCount = 1;
        }

        let freeUnits = allUnits.slice(0, freeItemsCount);
        let paidUnits = allUnits.slice(freeItemsCount);

        paidUnits.forEach(u => totalCartSum += u.price);
        container.innerHTML = '';

        let paidMap = {};
        paidUnits.forEach(u => {
            if (!paidMap[u.id]) paidMap[u.id] = { name: u.name, price: u.price, qty: 0 };
            paidMap[u.id].qty++;
        });

        Object.values(paidMap).forEach(item => {
            const row = document.createElement('div');
            row.style.cssText = "display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px dashed #eee;";
            row.innerHTML = `
        <div>
          <span style="font-weight: 600;">${item.name}</span>
          <span style="color: #777;"> (x${item.qty})</span>
        </div>
        <span style="font-weight: bold; color: #d88195;">₪${(item.qty * item.price).toFixed(2)}</span>
      `;
            container.appendChild(row);
        });

        let freeMap = {};
        freeUnits.forEach(u => {
            if (!freeMap[u.id]) freeMap[u.id] = { name: u.name, price: u.price, qty: 0 };
            freeMap[u.id].qty++;
        });

        Object.values(freeMap).forEach(gift => {
            const row = document.createElement('div');
            row.style.cssText = "display: flex; justify-content: space-between; padding: 10px; margin: 5px 0; background: #f0f9f4; border: 1px solid #c3e6cb; border-radius: 6px;";
            row.innerHTML = `
        <div>
          <span style="color: #28a745; font-weight: bold;">🎁 מוצר מתנה (מבצע):</span>
          <span>${gift.name}</span>
        </div>
        <div>
          <span style="text-decoration: line-through; color: #888; margin-left: 6px;">₪${gift.price.toFixed(2)}</span>
          <span style="font-weight: bold; color: #28a745;">₪0.00</span>
        </div>
      `;
            container.appendChild(row);
        });

        if (hasMysteryGift) {
            const row = document.createElement('div');
            row.style.cssText = "display: flex; justify-content: space-between; padding: 10px; margin: 5px 0; background: #fff3cd; border: 1px solid #ffeeba; border-radius: 6px;";
            row.innerHTML = `
        <div>
          <span style="color: #856404; font-weight: bold;">🎁 מתנה מפתיעה (Mystery Gift):</span>
          <span>מוצר הפתעה בלעדי!</span>
        </div>
        <span style="font-weight: bold; color: #28a745;">₪0.00</span>
      `;
            container.appendChild(row);
        }

        const isFreeShipping = this.settings.freeShippingThreshold > 0 && totalCartSum >= this.settings.freeShippingThreshold;
        const deliveryFee = isFreeShipping ? 0 : this.settings.baseDeliveryFee;
        const grandTotal = totalCartSum + deliveryFee;

        if (subtotalElement) subtotalElement.textContent = `₪${totalCartSum.toFixed(2)}`;
        if (deliveryElement) {
            deliveryElement.innerHTML = deliveryFee === 0
                ? '<span style="color: #28a745; font-weight: bold;">חינם</span>'
                : `₪${deliveryFee.toFixed(2)}`;
        }
        if (totalElement) totalElement.textContent = `₪${grandTotal.toFixed(2)}`;

        if (promoNotice) {
            if (hasMysteryGift) {
                promoNotice.textContent = "🎁 קיבלת מוצר מתנה במבצע + מתנה מפתיעה!";
            } else if (freeItemsCount > 0) {
                promoNotice.textContent = "🎁 קיבלת מוצר מתנה במבצע!";
            } else {
                promoNotice.textContent = "";
            }
        }
    }
};

/* ==========================================
   7. MAKE WEBHOOK INTEGRATION
   ========================================== */
const MAKE_WEBHOOK_URL = 'https://hook.eu1.make.com/4v3u6jcd1mik088lvu80v06e3ou5g8qc';

// 1. Target your checkout form by its exact HTML ID (e.g., id="checkoutForm")
const checkoutForm = document.getElementById('checkoutForm') || document.querySelector('form');
const checkoutBtn = document.getElementById('payBtn') || document.querySelector('.primary-btn');

if (checkoutForm && checkoutBtn) {
    checkoutForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        console.log("👉 Form submit event triggered successfully!");

        // 2. Read and verify field values
        const firstName = document.getElementById('firstName')?.value.trim() || '';
        const lastName = document.getElementById('lastName')?.value.trim() || '';
        const email = document.getElementById('custEmail')?.value.trim() || '';
        const phone = document.getElementById('custPhone')?.value.trim() || '';
        const address = document.getElementById('custAddress')?.value.trim() || '';
        const city = document.getElementById('custCity')?.value.trim() || '';

        console.log("📝 Read field values:", { firstName, lastName, email, phone, address, city });

        // 3. Validate required fields
        const allFilled = firstName && lastName && email && phone && address && city;
        if (!allFilled) {
            console.warn("⚠️ Submission blocked: One or more required fields are empty.");
            alert("אנא מלא את כל שדות החובה לפני המשך התשלום.");
            return;
        }

        // 4. Prevent duplicate rapid triggers
        if (window.isSubmitting) {
            console.warn("⚠️ Submission blocked: Request already in progress.");
            return;
        }
        window.isSubmitting = true;

        // 5. Show loading animation
        const originalContent = checkoutBtn.innerHTML;
        checkoutBtn.innerHTML = `<span class="spinner"></span> מייצר קישור תשלום...`;
        checkoutBtn.style.opacity = '0.7';
        checkoutBtn.style.cursor = 'not-allowed';

        const customerData = {
            name: firstName + " " + lastName,
            email: email,
            phone: phone,
            adress: address + " " + city,
        };

        try {
            console.log("🚀 Calling sendCheckoutToMake()...");
            await sendCheckoutToMake(customerData, checkoutBtn);
        } catch (err) {
            console.error("❌ Exception caught during checkout:", err);
        } finally {
            // Restore button state
            checkoutBtn.style.opacity = '1';
            checkoutBtn.style.cursor = 'pointer';
            checkoutBtn.innerHTML = originalContent;
            window.isSubmitting = false;
            console.log("🔒 Submission completed and button reset.");
        }
    });
} else {
    console.error("❌ Checkout form or button not found in the DOM!");
}

async function sendCheckoutToMake(customerDetails = {}, btn = null) {
    const cart = getCart();

    if (!cart || cart.length === 0) {
        alert('הסל שלך ריק!');
        return false;
    }

    const subtotal = cart.reduce((sum, item) => {
        const price = Number(item.price || item.fields?.price || 0);
        const qty = Number(item.quantity || item.qty || 1);
        return sum + (price * qty);
    }, 0);

    const shippingFee = subtotal >= 250 ? 0 : 35;
    const grandTotal = subtotal + shippingFee;

    btn = document.getElementById('payBtn');

    const payload = {
        customer: customerDetails,
        cart: cart.map(item => ({
            id: String(item.id || item.sys?.id || ''),
            name: item.title || item.name || item.fields?.title || 'מוצר',
            price: Number(item.price || item.fields?.price || 0),
            quantity: Number(item.quantity || item.qty || 1),
        })),
        pricing: {
            subtotal: subtotal,
            shippingFee: shippingFee,
            total: grandTotal,
            isFreeShipping: subtotal >= 250
        },
        createdAt: new Date().toISOString()
    };

    try {
        const response = await fetch(MAKE_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`Server status: ${response.status}`);
        }

        const rawText = await response.text();
        let targetUrl = '';

        try {
            const data = JSON.parse(rawText);
            targetUrl = data.paymentUrl || data.url || data.link || (typeof data === 'string' && data.startsWith('http') ? data : '');
        } catch {
            const trimmed = rawText.trim().replace(/^"|"$/g, '');
            if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
                targetUrl = trimmed;
            }
        }

        if (targetUrl) {
            saveCart([]);
            if (typeof renderCart === 'function') renderCart();
            if (typeof CloseCart === 'function') CloseCart();
            window.location.href = targetUrl;
            resetButton(btn, "מעבר לתשלום מאובטח")
            return true;
        } else {
            console.error('❌ Make returned response without a valid payment URL:', rawText);
            alert('אירעה שגיאה בקבלת קישור לתשלום. אנא נסה שוב.');
            resetButton(btn, "מעבר לתשלום מאובטח")
            return false;
        }

    } catch (error) {
        console.error('❌ Error sending checkout to Make:', error);
        alert('אירעה שגיאה בביצוע ההזמנה. אנא נסה שוב.');
        resetButton(btn, "מעבר לתשלום מאובטח")
        return false;
    }
}

// Helper to restore button if request fails
function resetButton(btn, originalText) {
    if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}



/* ==========================================
   10. SINGLE CONSOLIDATED DOM LOAD LISTENER
   ========================================== */
document.addEventListener('DOMContentLoaded', () => {
    // 1. Core Page Initialization
    PageLoaded();
    fetchProducts();
    loadHeroBanners();
    renderDualBanners(dualBannersData);


    // 2. Sections to hide during active search
    const categoriesSection = document.querySelector('.categories-section');
    const heroCarousel = document.querySelector('.hero-carousel-wrapper');
    const dualBanners = document.getElementById('dualBannersCarousel');

    // 3. Smart Live Search Listener
    const searchInput = document.getElementById("Search");
    if (searchInput) {
        searchInput.addEventListener('input', function () {
            let query = this.value.trim();
            let listItems = document.querySelectorAll('#ItemsList li, #productGrid li, .product-grid li, #WishListItems > *');

            const isSearching = query.length > 0;
            if (categoriesSection) categoriesSection.style.display = isSearching ? 'none' : '';
            if (heroCarousel) heroCarousel.style.display = isSearching ? 'none' : '';
            if (dualBanners) dualBanners.style.display = isSearching ? 'none' : '';

            listItems.forEach((item) => {
                let itemText = item.textContent || item.innerText;
                item.style.display = isSmartSearchMatch(itemText, query) ? '' : 'none';
            });
        });
    }

    // 5. Cookie Consent Banner Listener
    const cookieBanner = document.getElementById('cookieBanner');
    const acceptBtn = document.getElementById('acceptCookiesBtn');

    if (cookieBanner && acceptBtn) {
        if (!localStorage.getItem('cookiesAccepted')) {
            cookieBanner.classList.remove('hidden');
        }
        acceptBtn.addEventListener('click', () => {
            localStorage.setItem('cookiesAccepted', 'true');
            cookieBanner.classList.add('hidden');
        });
    }
});

/* ==========================================
   11. ACCESSABILITY AND COOKIES
   ========================================== */

document.addEventListener('DOMContentLoaded', () => {
    const cookieBanner = document.getElementById('cookieBanner');
    const acceptBtn = document.getElementById('acceptCookiesBtn');

    // Check if user already accepted regulations/cookies
    const hasAccepted = localStorage.getItem('cookiesAccepted');

    if (!hasAccepted && cookieBanner) {
        cookieBanner.classList.remove('hidden');
    }

    if (acceptBtn) {
        acceptBtn.addEventListener('click', () => {
            // Save preference so banner doesn't show again
            localStorage.setItem('cookiesAccepted', 'true');

            // Hide banner
            if (cookieBanner) {
                cookieBanner.classList.add('hidden');
            }
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const toggleBtn = document.getElementById('accToggleBtn');
    const closeBtn = document.getElementById('accCloseBtn');
    const menu = document.getElementById('accMenu');

    // Toggle Panel
    if (toggleBtn && menu) {
        toggleBtn.addEventListener('click', () => {
            menu.classList.toggle('hidden');
        });
    }

    if (closeBtn && menu) {
        closeBtn.addEventListener('click', () => {
            menu.classList.add('hidden');
        });
    }

    // Generic Class Toggler
    function setupToggle(btnId, className) {
        const btn = document.getElementById(btnId);
        if (!btn) return;

        btn.addEventListener('click', () => {
            const active = document.body.classList.toggle(className);
            btn.classList.toggle('active', active);
            localStorage.setItem(className, active ? 'true' : 'false');
        });

        if (localStorage.getItem(className) === 'true') {
            document.body.classList.add(className);
            btn.classList.add('active');
        }
    }

    // Standard Toggles
    setupToggle('accLetterSpacingBtn', 'acc-letter-spacing');
    setupToggle('accLineHeightBtn', 'acc-line-height');
    setupToggle('accHideImagesBtn', 'acc-hide-images');
    setupToggle('accStopAnimationsBtn', 'acc-stop-animations');
    setupToggle('accColorHeadlines', 'acc-colored-headlines');
    setupToggle('accColorText', 'acc-colored-text');
    setupToggle('accHighContrastBtn', 'acc-high-contrast');

    // Alignment Options (Exclusive)
    const alignBtns = {
        'accAlignRight': 'acc-align-right',
        'accAlignCenter': 'acc-align-center',
        'accAlignLeft': 'acc-align-left'
    };

    Object.entries(alignBtns).forEach(([btnId, className]) => {
        const btn = document.getElementById(btnId);
        if (!btn) return;

        btn.addEventListener('click', () => {
            Object.values(alignBtns).forEach(c => document.body.classList.remove(c));
            Object.keys(alignBtns).forEach(id => {
                const el = document.getElementById(id);
                if (el) el.classList.remove('active');
            });

            document.body.classList.add(className);
            btn.classList.add('active');
            localStorage.setItem('acc-alignment', className);
        });
    });

    const savedAlign = localStorage.getItem('acc-alignment');
    if (savedAlign && document.body) {
        document.body.classList.add(savedAlign);
        const activeKey = Object.keys(alignBtns).find(k => alignBtns[k] === savedAlign);
        if (activeKey) {
            const activeBtn = document.getElementById(activeKey);
            if (activeBtn) activeBtn.classList.add('active');
        }
    }

    // Screen Reader / Text-to-Speech (Fixed for dynamic voice loading)
    const readBtn = document.getElementById('accReadTextBtn');

    if (readBtn && 'speechSynthesis' in window) {
        readBtn.addEventListener('click', () => {
            const selectedText = window.getSelection().toString().trim();

            if (!selectedText) {
                alert('אנא סמן טקסט בעמוד כדי שהמערכת תקריא אותו.');
                return;
            }

            // Stop any active speech
            window.speechSynthesis.cancel();

            const utterance = new SpeechSynthesisUtterance(selectedText);
            utterance.lang = 'he-IL';

            // Fetch voices dynamically on click so they are fully loaded
            const voices = window.speechSynthesis.getVoices();
            const hebrewVoice = voices.find(voice =>
                voice.lang.toLowerCase().includes('he') ||
                voice.name.toLowerCase().includes('hebrew')
            );

            if (hebrewVoice) {
                utterance.voice = hebrewVoice;
            }

            window.speechSynthesis.speak(utterance);
        });
    }

    // Mute Audio Elements
    const muteBtn = document.getElementById('accMuteSoundsBtn');
    if (muteBtn) {
        muteBtn.addEventListener('click', () => {
            const mediaElements = document.querySelectorAll('audio, video');
            const isMuted = document.body.classList.toggle('acc-muted');
            mediaElements.forEach(media => { media.muted = isMuted; });
            muteBtn.classList.toggle('active', isMuted);
        });
    }

    // Reset All Settings
    const resetBtn = document.getElementById('accResetBtn');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            window.speechSynthesis?.cancel();
            localStorage.clear();
            location.reload();
        });
    }
});

/* ==========================================
   MOBILE TOUCH SWIPE INITIALIZATION
   ========================================== */
function initMobileBannerSwipes() {
    // 1. Hero Banner Carousel Swipe Handler
    const heroContainer = document.querySelector('.carousel-container') || document.getElementById('bannerContainer');
    if (heroContainer) {
        attachSwipeHandler(heroContainer, {
            onSwipeLeft: () => {
                if (typeof moveBanner === 'function') moveBanner(-1);
            },
            onSwipeRight: () => {
                if (typeof moveBanner === 'function') moveBanner(1);
            }
        });
    }

    // 2. Dual Banners Carousel Swipe Handler
    const dualContainer = document.getElementById('dualBannersCarousel');
    if (dualContainer) {
        attachSwipeHandler(dualContainer, {
            onSwipeLeft: () => {
                if (typeof moveSlide === 'function') moveSlide('dualBannersCarousel', -1);
            },
            onSwipeRight: () => {
                if (typeof moveSlide === 'function') moveSlide('dualBannersCarousel', 1);
            }
        });
    }
}

function attachSwipeHandler(element, callbacks) {
    let startX = 0;
    let startY = 0;
    let endX = 0;
    let endY = 0;
    const minSwipeDistance = 30; // Minimum drag in px to trigger swipe

    element.addEventListener('touchstart', (e) => {
        startX = e.changedTouches[0].clientX;
        startY = e.changedTouches[0].clientY;
    }, { passive: true });

    element.addEventListener('touchend', (e) => {
        endX = e.changedTouches[0].clientX;
        endY = e.changedTouches[0].clientY;

        const diffX = endX - startX;
        const diffY = endY - startY;

        // Ensure horizontal movement exceeds vertical movement
        if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) >= minSwipeDistance) {
            if (diffX < 0) {
                // Swiped Left
                //for some reason its in reverse? so I flipped it here when I swipe left and onswipe is Left it swipes right
                if (typeof callbacks.onSwipeLeft === 'function') callbacks.onSwipeLeft();
            } else {
                // Swiped Right
                //for some reason its in reverse? so I flipped it here when I swipe Right and onswipe is Right it swipes left
                if (typeof callbacks.onSwipeRight === 'function') callbacks.onSwipeRight();
            }
        }
    }, { passive: true });
}

// Bind event on DOM load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileBannerSwipes);
} else {
    initMobileBannerSwipes();
}
