// Initialize Contentful Client
const client = contentful.createClient({
    space: 'v559p2wzhl5w',
    accessToken: 'RZOFA-Qr_tng7FiHxqvX7qaomtZ8oaJzuasdIZYhgk4'
});

var allProducts = [];
let wishlist = JSON.parse(localStorage.getItem('wishlist')) || [];
var currentPath = "";

async function fetchProducts() {
    console.log("1. fetchProducts() function has started running...");
    try {
        const response = await client.getEntries({
            content_type: 'product'
        });

        console.log("2. Response received from Contentful:", response);

        if (!response.items || response.items.length === 0) {
            console.warn("⚠️ Contentful connected, but returned 0 items!");
        } else {
            console.log(`3. Found ${response.items.length} items.`);

            allProducts = response.items;
            localStorage.setItem('allProductsCatalog', JSON.stringify(allProducts));

            syncCartWithContentful(response.items);
            displayProducts(response.items);
        }

    } catch (error) {
        console.error("❌ Contentful Connection Error:", error);
    }
}

// Keep cart prices updated with Contentful
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
            const fields = matchedProduct.fields;
            const isOnSale = fields.onSale === true;

            const freshPrice = isOnSale && fields.salePrice !== undefined
                ? Number(fields.salePrice)
                : Number(fields.price);

            const oldPrice = Number(cartItem.price);

            if (oldPrice !== freshPrice) {
                cartItem.price = freshPrice;
                updated = true;
            }
        }
    });

    if (updated) {
        saveCart(cart);
        renderCart();
    }
}

function updateCartQuantity(newQuantity) {
    const badge = document.querySelector('.icon-btn .badge');
    const opQuantity = document.getElementById('OpQuantity');

    const qty = newQuantity || 0;
    if (badge) badge.innerText = qty;
    if (opQuantity) opQuantity.innerText = qty;
}

/* ==========================================
   1. DISPLAY PRODUCTS
   ========================================== */
function displayProducts(products) {
    const container = document.getElementById('ItemsList');
    if (!container) return;

    if (Array.isArray(products) && products.length > 0) {
        localStorage.setItem('allProductsCatalog', JSON.stringify(products));
    }

    container.innerHTML = '';

    const targetCategory = container.getAttribute('data-category');
    let productsToDisplay = products;

    if (targetCategory) {
        productsToDisplay = products.filter(item => item.fields && item.fields.category === targetCategory);
    }

    if (productsToDisplay.length === 0) {
        container.innerHTML = `<p class="no-products">אין מוצרים זמינים בקטגוריה זו כרגע.</p>`;
        return;
    }

    const isSalePage = container.getAttribute('data-sale');
    if (isSalePage === "true") {
        productsToDisplay = productsToDisplay.filter(item => item.fields && item.fields.onSale === true);
    }

    if (productsToDisplay.length === 0) {
        container.innerHTML = `<p class="no-products">אין מוצרים במבצע כרגע.</p>`;
        return;
    }

    productsToDisplay.forEach(item => {
        const name = item.fields.name || 'מוצר';
        const price = item.fields.price || 0;
        const isOnSale = item.fields.onSale === true;
        const salePrice = item.fields.salePrice !== undefined ? item.fields.salePrice : price;
        const about = item.fields.about || name;
        const Category = item.fields.category || 'Product';
        const id = item.fields.id || item.sys?.id;

        const activePrice = isOnSale ? salePrice : price;
        const imageUrl = item.fields.pic?.fields?.file?.url ? `https:${item.fields.pic.fields.file.url}` : 'https://via.placeholder.com/200';

        const safeName = name.replace(/'/g, "\\'");
        const itemJSON = JSON.stringify(item).replace(/'/g, "&apos;").replace(/"/g, "&quot;");

        const isWishlisted = wishlist.some(w => String(w.id) === String(id));
        const heartClass = isWishlisted ? 'fa-solid filled' : 'fa-regular outline';

        let priceHTML = `<div class="p-price"><span class="Price new-price">₪${price}</span></div>`;

        if (isOnSale) {
            priceHTML = `
                <div class="p-price">
                    <span class="old-price">₪${price}</span>
                    <span class="Price new-price">₪${salePrice}</span>
                </div>
            `;
        }

        const productHTML = `
            <li>
                <div class="product-card" id="${id}">
                    <div class="product-image">
                        <img class="ProductImg" 
                             onclick='goToProductPage(${itemJSON})' 
                             alt="${Category}" 
                             src="${imageUrl}" />
                    </div>
                    <div class="product-info">
                        <p class="p-name About" onclick='goToProductPage(${itemJSON})'>${about}</p>
                        <p class="p-category AboutInv">${Category}</p>

                        ${priceHTML}

                        <div class="p-actions">
                            <button class="add-to-cart AddToCart" name="${id}" onclick="AddCartItem('${safeName}', '${id}', '${activePrice}', '${imageUrl}')">
                                הוסף לסל
                            </button>
                            <i class="fa-heart wishlist-heart ${heartClass}" 
                               data-id="${id}" 
                               onclick="toggleWishlist(this, { id: '${id}', name: '${safeName}', price: ${price}, img: '${imageUrl}', category: '${Category}', onsale: ${isOnSale}, saleprice: '${salePrice}' })">
                            </i>
                        </div>
                    </div>
                </div>
            </li>
        `;

        container.innerHTML += productHTML;
    });

    syncHeartIcons();
}

/* ==========================================
   2. WISHLIST CORE FUNCTIONS
   ========================================== */
function toggleWishlist(element, product) {
    if (!product || !product.id) return;

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

    saveAndUpdate();
}

function removeFromWishlist(productId) {
    wishlist = wishlist.filter(item => String(item.id) !== String(productId));
    saveAndUpdate();
    renderWishlistPage();
    syncHeartIcons();
}

function saveAndUpdate() {
    localStorage.setItem('wishlist', JSON.stringify(wishlist));
    updateWishlistBadge();
}

function updateWishlistBadge() {
    const wishlistBadge = document.querySelector('.wishlist-icon .badge');
    if (wishlistBadge) {
        wishlistBadge.textContent = wishlist.length;
    }
}

function syncHeartIcons() {
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

/* ==========================================
   3. RENDER WISHLIST PAGE
   ========================================== */
function renderWishlistPage() {
    const container = document.getElementById('WishListItems');
    if (!container) return;

    if (wishlist.length === 0) {
        container.innerHTML = '<li class="empty-wishlist-msg">רשימת המשאלות שלך ריקה</li>';
        return;
    }

    container.innerHTML = wishlist.map(item => {
        const title = item.name || item.title || 'מוצר';
        const price = item.price || '0';
        const image = item.img || '';
        const id = item.id || "";
        const saleP = item.saleprice || "";
        const isonsale = item.onsale === true || item.onsale === "true";
        const Category = item.category || "Product";
        const about = item.about || title;

        const safeTitle = title.replace(/'/g, "\\'");
        const activePrice = isonsale && saleP ? saleP : price;

        const isWishlisted = wishlist.some(w => String(w.id) === String(id));
        const heartClass = isWishlisted ? 'fa-solid filled' : 'fa-regular outline';

        let priceHTML = `<div class="p-price"><span class="Price new-price">₪${price}</span></div>`;
        if (isonsale && saleP) {
            priceHTML = `
                <div class="p-price">
                    <span class="old-price">₪${price}</span>
                    <span class="Price new-price">₪${saleP}</span>
                </div>
            `;
        }

        return `
            <li>
                <div class="product-card" id="${id}">
                    <div class="product-image">
                        <img class="ProductImg" 
                             onclick='goToProductPage({ id: "${id}", name: "${safeTitle}", price: ${price}, activePrice: ${activePrice}, img: "${image}", category: "${Category}", about: "${about}", onsale: ${isonsale}, saleprice: "${saleP}" })' 
                             alt="${Category}" 
                             src="${image}" />
                    </div>
                    <div class="product-info">
                        <p class="p-name About" onclick='goToProductPage({ id: "${id}", name: "${safeTitle}", price: ${price}, activePrice: ${activePrice}, img: "${image}", category: "${Category}", about: "${about}", onsale: ${isonsale}, saleprice: "${saleP}" })'>
                           ${about}
                        </p>
                        <p class="p-category AboutInv">${Category}</p>
            
                        ${priceHTML}
            
                        <div class="p-actions">
                            <button class="add-to-cart AddToCart" name="${id}" onclick="AddCartItem('${safeTitle}', '${id}', '${activePrice}', '${image}')">
                                הוסף לסל
                            </button>
                            <i class="fa-heart wishlist-heart ${heartClass}" 
                               data-id="${id}" 
                               onclick="toggleWishlist(this, { id: '${id}', name: '${safeTitle}', price: ${price}, img: '${image}', category: '${Category}', onsale: ${isonsale}, saleprice: '${saleP}' })">
                            </i>
                        </div>
                    </div>
                </div>
            </li>
        `;
    }).join('');
}

/* ==========================================
   4. DOM CONTENT LOADED & EVENT LISTENERS
   ========================================== */
document.addEventListener('DOMContentLoaded', () => {
    PageLoaded();
    console.log("DOM loaded! Starting Contentful fetch...");
    fetchProducts();

    // Live Search Filter
    const searchInput = document.getElementById("Search");
    if (searchInput) {
        searchInput.addEventListener('keyup', function() {
            let filter = this.value.toUpperCase();
            let listItems = document.querySelectorAll('#ItemsList li');

            listItems.forEach((item) => {
                let text = item.textContent;
                if(text.toUpperCase().indexOf(filter) > -1) {
                    item.classList.remove('hidden');
                } else {
                    item.classList.add('hidden');
                }
            });
        });
    }
});

setInterval(fetchProducts, 1200000);

/* ==========================================
   5. CART & NAVIGATION HELPERS
   ========================================== */
function AddQuantity() {
    const opCartQuantity = document.getElementById("OpQuantity");
    let currentQ = Number(localStorage.getItem("OpCartQ") || 0) + 1;
    localStorage.setItem("OpCartQ", currentQ);
    updateCartQuantity(currentQ);
    if(opCartQuantity) opCartQuantity.innerText = currentQ;
}

function SubtractQuantity() {
    const opCartQuantity = document.getElementById("OpQuantity");
    let currentQ = Math.max(0, Number(localStorage.getItem("OpCartQ") || 0) - 1);
    localStorage.setItem("OpCartQ", currentQ);
    updateCartQuantity(currentQ);
    if(opCartQuantity) opCartQuantity.innerText = currentQ;
}

function AddCartItem(name, id, price, src) {
    OpenCart();
    addToCart(name, id, price, src);
}

function CloseCart(){
    const Cart = document.getElementById("Cart");
    if (Cart) {
        Cart.classList.remove('active');
        document.body.classList.remove('no-scroll');
    }
}

function OpenCart(){
    const Cart = document.getElementById("Cart");
    if (Cart) {
        Cart.classList.add('active');
        document.body.classList.add('no-scroll');
    }
}

function PageLoaded() {
    CloseCart();
    updateWishlistBadge();
    syncHeartIcons();
    renderWishlistPage();
    currentPath = window.location.pathname;

    let cart = getCart();
    let totalQty = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
    localStorage.setItem("OpCartQ", totalQty);
    updateCartQuantity(totalQty);
    renderCart();
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
    localStorage.setItem("shopping_cart", JSON.stringify(cart));
    localStorage.setItem("cart", JSON.stringify(cart)); // Mirror for checkout compatibility
}

function addToCart(name, id, price, src) {
    let cart = getCart();

    const existingItem = cart.find(item => String(item.id) === String(id));

    if (existingItem) {
        existingItem.quantity = (existingItem.quantity || 1) + 1;
        existingItem.price = Number(price);
    } else {
        cart.push({
            id: id,
            name: name,
            title: name,
            price: Number(price),
            src: src,
            image: src,
            quantity: 1
        });
        AddQuantity();
    }

    saveCart(cart);
    renderCart();
}

function renderCart() {
    const cart = getCart();
    const CartUl = document.getElementById("CartItems");
    const OverAll = document.getElementById("Cost");

    if (CartUl) CartUl.innerHTML = "";

    let totalCartSum = 0;

    cart.forEach(item => {
        const li = document.createElement("li");
        li.className = "cart-item";

        const img = document.createElement("img");
        img.src = item.src || item.image || '';
        img.className = "cart-item-img";

        const detailsContainer = document.createElement("div");
        detailsContainer.className = "cart-item-details";

        const Pname = document.createElement("p");
        Pname.className = "cart-item-name";
        Pname.textContent = item.name || item.title;

        const itemTotalCost = item.price * item.quantity;
        totalCartSum += itemTotalCost;

        const Pprice = document.createElement("p");
        Pprice.className = "cart-item-price";
        Pprice.textContent = `${item.quantity} x ₪${item.price} = ₪${itemTotalCost}`;

        detailsContainer.appendChild(Pname);
        detailsContainer.appendChild(Pprice);

        const controlsColumn = document.createElement("div");
        controlsColumn.className = "item-controls-column";

        const Plus = document.createElement("button");
        Plus.textContent = "+";
        Plus.className = "cart-btn";

        const Quantity = document.createElement("p");
        Quantity.className = "cart-item-qty-text";
        Quantity.textContent = item.quantity;

        const Minus = document.createElement("button");
        Minus.textContent = "-";
        Minus.className = "cart-btn";

        controlsColumn.appendChild(Plus);
        controlsColumn.appendChild(Quantity);
        controlsColumn.appendChild(Minus);

        li.appendChild(img);
        li.appendChild(detailsContainer);
        li.appendChild(controlsColumn);

        Minus.addEventListener("click", function () {
            let currentCart = getCart();
            let foundItem = currentCart.find(i => String(i.id) === String(item.id));

            if (foundItem) {
                foundItem.quantity -= 1;
                if (foundItem.quantity <= 0) {
                    SubtractQuantity();
                    currentCart = currentCart.filter(i => String(i.id) !== String(item.id));
                }
                saveCart(currentCart);
                renderCart();
            }
        });

        Plus.addEventListener("click", function () {
            let currentCart = getCart();
            let foundItem = currentCart.find(i => String(i.id) === String(item.id));

            if (foundItem) {
                foundItem.quantity += 1;
                saveCart(currentCart);
                renderCart();
            }
        });

        if (CartUl) CartUl.appendChild(li);
    });

    if (OverAll) {
        if (totalCartSum < 200 && totalCartSum > 0) {
            OverAll.innerHTML = `סך הכל: ₪${totalCartSum} <p class="shipping-notice">בקניה מעל ₪200 משלוח חינם</p>`;
        } else if (totalCartSum >= 200) {
            OverAll.innerHTML = `סך הכל: ₪${totalCartSum} <p class="shipping-notice">* משלוח חינם</p>`;
        } else {
            OverAll.innerHTML = `סך הכל: ₪0`;
        }
    }
}

function goToProductPage(product) {
    if (!product) return;

    const fields = product.fields || product;
    const normalizedProduct = {
        id: fields.id || product.sys?.id || '',
        name: fields.name || fields.title || 'מוצר',
        price: fields.price || 0,
        saleprice: fields.salePrice !== undefined ? fields.salePrice : (fields.saleprice || ''),
        onsale: fields.onSale === true || fields.onsale === true,
        category: fields.category || fields.Category || 'Product',
        about: fields.about || fields.name || '',
        img: fields.pic?.fields?.file?.url ? `https:${fields.pic.fields.file.url}` : (fields.img || fields.image || '')
    };

    sessionStorage.setItem('selectedProduct', JSON.stringify(normalizedProduct));
    window.location.href = `product.html?id=${normalizedProduct.id}`;
}

function toggleMenu() {
    const sideMenu = document.getElementById('sideMenu');
    const overlay = document.getElementById('menuOverlay');

    if (sideMenu && overlay) {
        sideMenu.classList.toggle('active');
        overlay.classList.toggle('active');
    }
}

function toggleDropdown(element) {
    const parent = element.parentElement;
    if (parent) {
        parent.classList.toggle('open');
    }
}

/* ==========================================
   CAROUSEL SLIDER LOGIC
   ========================================== */

const carouselStates = {
    mainHeroCarousel: 0,
    dualBannersCarousel: 0
};

function moveSlide(carouselId, direction) {
    const carousel = document.getElementById(carouselId);
    if (!carousel) return;

    const slides = carousel.querySelectorAll('.carousel-slide');
    const totalSlides = slides.length;
    if (totalSlides === 0) return;

    let currentIndex = carouselStates[carouselId] || 0;
    currentIndex = (currentIndex + direction + totalSlides) % totalSlides;

    goToSlide(carouselId, currentIndex);
}

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

/* ==========================================
   DYNAMIC CONTENTFUL BANNER BINDING
   ========================================== */

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

    document.getElementById('bannerImage').src = imgUrl || "#";
    document.getElementById('bannerTitle').innerText = fields.header || 'ONLY YOU';
    document.getElementById('bannerSubtitle').innerText = fields.text || 'הנחה על כל סדרת 20% ONLY YOU';

    const btn = document.getElementById('bannerBtn');
    btn.href = fields.linkUrl || fields.targetPage || '../HtmlPages/SalePage.html';
    btn.innerText = fields.buttonText || 'קנה עכשיו';
}

function renderDots() {
    const dotsContainer = document.getElementById('carouselDots');
    if (!dotsContainer) return;

    dotsContainer.innerHTML = bannerItems.map((_, idx) => `
        <span class="dot ${idx === currentIndex ? 'active' : ''}" onclick="goToBanner(${idx})"></span>
    `).join('');
}

function moveBanner(direction) {
    currentIndex = (currentIndex + direction + bannerItems.length) % bannerItems.length;
    updateBannerDisplay(currentIndex);
    renderDots();
}

function goToBanner(index) {
    currentIndex = index;
    updateBannerDisplay(currentIndex);
    renderDots();
}


const dualBannersData = [
    { img: 'Banners/PishtanBanner.png', alt: 'Banner 1' , page: 'Pishtan.html'},
    { img: 'Banners/HemphaBanner.png', alt: 'Banner 2' , page: 'Hempha.html'},
    { img: 'Banners/Coco&Honey Banner.png', alt: 'Banner 3' , page: 'Coco&Honey.html'},
    { img: 'Banners/MyCollection Banner.png', alt: 'Banner 4' , page: 'MyCollection.html'},
    { img: 'Banners/Keratin Forte Banner.png', alt: 'Banner 5' , page: 'KeratinForte.html'},
    { img: 'Banners/Curls Banner.png', alt: 'Banner 6' , page: 'Curls.html'}
];

function renderDualBanners(items) {
    const track = document.querySelector('#dualBannersCarousel .carousel-track');
    const dotsContainer = document.querySelector('#dualBannersCarousel .carousel-dots');

    if (!track || !dotsContainer) return;

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

function getImageUrl(item) {
    const fields = item.fields || item;

    if (fields.pic?.fields?.file?.url) {
        return fields.pic.fields.file.url.startsWith('//')
            ? `https:${fields.pic.fields.file.url}`
            : fields.pic.fields.file.url;
    }
    if (fields.pic?.file?.url) {
        return fields.pic.file.url.startsWith('//')
            ? `https:${fields.pic.file.url}`
            : fields.pic.file.url;
    }
    if (typeof fields.pic === 'string' && fields.pic.trim() !== '') {
        return fields.pic;
    }
    return fields.img || fields.image || '';
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

async function processPayment(orderData) {
    try {
        const response = await fetch('YOUR_MAKE_WEBHOOK_URL', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                amount: orderData.price,
                itemName: orderData.name,
                orderId: orderData.id,
                customerEmail: orderData.email || ''
            })
        });

        const data = await response.json();
        if (data.paymentUrl) {
            window.location.href = data.paymentUrl;
        } else {
            alert('Unable to generate payment link. Please try again.');
        }
    } catch (error) {
        console.error('Payment Error:', error);
    }
}
