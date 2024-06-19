/**
 * Responsible for building interface. 
 * Reads in data that has already been "cleaned" by decompose.js, then parses 
 * it out into "cards" to display to the user on load.
 */
'use strict';

(function () {

  window.addEventListener('load', init);

  // holds extracted product information from cleaned json files
  let allProducts = {};
  let allDetails = {};

  /**
   * initializes the page upon load. 
   */
  async function init() {
    let refresh = id('refresh');
    refresh.removeEventListener('click', loadPage);
    refresh.addEventListener('click', loadPage);
    try {
      await loadPage();
    } catch (err) {
      console.error('init ' + err);
    }
  }

  /**
   * retrieves cleaned product data to build interface and handle interactivity. 
   */
  async function loadPage() {
    try {
      // loading animations
      let items = id('items');
      let circle = qs('svg');
      let circle2 = id('load-circle');
      items.innerHTML = '';
      circle.classList.remove('hidden');
      circle2.classList.remove('hidden');

      // wait half a second to make sure data is fetched
      await setTimeout(async () => {
        console.log('timeout');
        allProducts = await getData();
        await buildInterface();
        let select = qs('select');
        select.addEventListener('change', () => {
          hideSections();
          sidebarTitle();
        });

        circle.classList.add('hidden');
        circle2.classList.remove('hidden');
      }, 500);
    } catch (err) {
      console.error('init ' + err);
    }
  }

  /**
   * retrieves all cleaned product data from cleaned-data directory.
   * @returns JSON object of formatted data for all products
   */
  async function getData() {
    try {
      let res = await fetch('/clean/products');
      await statusCheck(res);
      let data = await res.json();
      return data;
    } catch (err) {
      console.error('get data: ' + err); 
    }
  }

  /**
   * adds all cards to page, separated by search file. 
   */
  async function buildInterface() {
    // create search dropdown
    await search();
    sidebarTitle();

    // for each 'file' object in allProducts, build header separator
    let file;
    for (file in allProducts) {
      allDetails[file] = await readDetails(file);
      let selection = qs("select").value;
      addHeader(file, selection);

      // for each product in file, create card stack with displayname, score, skus
      let product;
      for (product in allProducts[file]) {
        addProductSection(allProducts[file][product], file);

        // for each sku in product, create card with image, score
        let sku;
        for (sku in allProducts[file][product]['skus']) {
          await addCard(allProducts[file][product], 
            allProducts[file][product]['skus'][sku]['skuScore'], 
            allProducts[file][product]['skus'][sku], sku,
            file);
        }

        // create the title card for the front of the stack
        addProductCard(allProducts[file][product]['skus'], 
          product, 
          allProducts[file][product],
          allProducts[file][product]['skus'][sku],
          file);
      }
      qs(`#${file} > .loading`).classList.add('hidden');
    }
    scoreIndent();
  }

/**
 * add new section for each file
 * @param {String} filename 
 */
  function addHeader(filename, selection) {
    let section = gen('section');
    section.id = filename;

    let load = gen('div');
    load.classList.add('load-items');
    load.classList.add('loading');
    section.appendChild(load);

    let parent = document.getElementById("items");
    parent.appendChild(section);

    selection = selection.split(" ").join("-");
    if (selection !== filename && selection !== 'all') {
      load.classList.add('hidden');
      section.classList.add('hidden');
    }
  }

  /**
   * put each product in its own group within the file card list
   * @param {Object} product - JSON object of product details
   * @param {String} file - the file the item was returned from. used to correctly
   *                        place the section on the page
   */
  function addProductSection(product, file) {
    let section = gen('section');
    section.classList.add(product['productId']);
    section.classList.add('product-container');

    let parent = document.getElementById(`${file}`);
    parent.appendChild(section);
  }

  /**
   * add title product card to card stack
   * @param {Object} data - JSON object of product data
   * @param {String} productId - ID of product
   * @param {String} displayName - Display name of product
   * @param {String} filename - file the item was returned from
   */
  function addProductCard(data, productId, displayName, skuData, filename) {
    const photoDiv = gen('div');
    photoDiv.classList.add('photo');
    const photo = gen('img');
    photo.src = skuData['skuImg'];
    photo.alt = data['displayName'];
    photoDiv.appendChild(photo);

    let scores = productScores(data);
    
    const search = gen('h1');
    search.textContent = "search: " + filename.split("-").join(" ");
    search.classList.add("card-search");
    const title = gen('h1');
    title.textContent = displayName['displayName'];
    const prodId = gen('h2');
    prodId.textContent = 'ID: ' + productId;
    const average = gen('h2');
    average.textContent = 'Score average: ' + scores[1];
    const max = gen('h2');
    max.textContent = 'Score maximum: ' + scores[2];
    const min = gen('h2');
    min.textContent = 'Score minimum: ' + scores[3];
    const count = gen('h2');
    count.textContent = 'SKU count: ' + scores[0];

    const contents = gen('div');
    contents.classList.add('card-contents');
    contents.appendChild(search);
    contents.appendChild(title);
    contents.appendChild(prodId);
    contents.appendChild(average);
    contents.appendChild(max);
    contents.appendChild(min);
    contents.appendChild(count);

    const article = gen('article');
    article.classList.add('product-card');
    article.classList.add('title-card');
    article.appendChild(photoDiv);
    article.appendChild(contents);

    const parent = document.getElementById(`${filename}`);
    const prodContainer = qs(`#${filename} .${productId}`);
    prodContainer.appendChild(article);
    parent.appendChild(prodContainer);
  }

  /**
   * compiles data about a product's skus' scores.
   * @param {Object} product 
   * @returns Array of numbers for various calculated aggregates
   */
  function productScores(product) {
    let count = 0;
    let total = 0;
    let max = 0;
    let min = 5000000000;

    let sku;
    for (sku in product) {
      let current = parseFloat(product[sku]['skuScore']);
      total += current;
      count ++;
      if (current > max) max = current;
      if (current < min) min = current;
    }
    let average = total / count;
    return [count, average, max, min];
  }

  /**
   * build and add SKU card to page
   * @param {Object} data - JSON object containing data about the item
   * @param {Number} value - total score of SKU
   * @param {Array} skuData - details about the SKU, used to retrieve image
   * @param {String} sku - the SKU of the item
   * @param {String} filename - the file the product was returned from. used to place
   *                      the card correctly on the page
   */
  async function addCard(data, value, skuData, sku, filename) {

    // the card that we'll assemble below
    const card = gen('article');
    card.classList.add('product-card');
  
    // add photo
    const photoDiv = gen('div');
    photoDiv.classList.add('photo');
    const photo = gen('img');
    photo.src = skuData['skuImg'];
    photo.alt = data['displayName'];
    photoDiv.appendChild(photo);
    
    // add title, productID, SKUID, overall score
    const title = gen('h1');
    title.textContent = data['displayName'];
    const prodId = gen('h2');
    prodId.textContent = 'ID: ' + data['productId'];
    const skuId = gen('h2');
    skuId.textContent = 'SKU: ' + sku;
    const score = gen('h2');
    score.textContent = 'Score: ' + value;

    // drop down!
    const dropDownButton = gen('button');
    dropDownButton.textContent = 'SCORE DETAILS';
    dropDownButton.classList.add('collapsible');
    const dropDownContainer = await scoreList(filename, 
      sku + '_' + data['productId'], card);

    dropDownButton.addEventListener('click', () => {
      dropDownButton.classList.toggle('active');
      let content = dropDownButton.nextElementSibling;
      content.classList.toggle('hidden');
    });

    const contents = gen('div');
    contents.classList.add('card-contents');
    contents.appendChild(title);
    contents.appendChild(prodId);
    contents.appendChild(skuId);
    contents.appendChild(score);
    contents.appendChild(dropDownButton);
    contents.appendChild(dropDownContainer);

    card.appendChild(photoDiv);
    card.appendChild(contents);

    const parent = document.getElementById(`${filename}`);
    const prodContainer = qs(`#${filename} .${data['productId']}`);
    prodContainer.appendChild(card);
    parent.appendChild(prodContainer);
  }

  /**
   * adds the score breakdown to a card. called from addCard()
   * @param {String} filename - name of the file the product was returned from.
   *                 used to cycle through correct details
   * @param {String} itemId - full SKU_ProductID of the item whose details we need
   * @param {HTMLElement} card - the card the details are being added to. passed
   *                      in so the boost classes can be applied
   * @returns completed container element for score dropdown
   */
  async function scoreList(filename, itemId, card) {
    const dropDownContainer = gen('article');
    dropDownContainer.classList.add('content');
    dropDownContainer.classList.add('hidden');
    
    // let file = await readDetails(filename);
    let file = allDetails[filename];

    // for each product in search results, check if it's the item we need
    let item;
    for (item in file) {
      if (item === itemId) {

        // for each score in item, add to item dropdown
        let score;
        for (score in file[item]) {
          const div = gen('div');

          const description = gen('p');
          let descContent = file[itemId][score][1];
          description.textContent = descContent;
          description.classList.add("detail-desc");

          let indent = "indent-" + file[itemId][score][0];
          description.classList.add(indent);

          const value = gen('p');
          let valContent = file[itemId][score][2];
          value.textContent = valContent;
          value.classList.add("detail-val");

          div.appendChild(description);
          div.appendChild(value);
          dropDownContainer.appendChild(div);

          // check which boosts are applied & add class to card for filtering
          if (descContent === "boost") {
            card.classList.add(`boost-${valContent}`);
            sidebarOption(`boost-${valContent}`);
          }
        }
      }
    }
    return dropDownContainer;
  }

  /**
   * indent the score breakdown items according to the nesting level
   */
  function scoreIndent() {
    for (let i = 1; i < 10; i++) {
      let desc = qsa(`.indent-${i}`);
      for (let k = 0; k < desc.length; k++) {
        let indent = (i-1) * 8;
        desc[k].style.marginLeft = `${indent}px`;
        const style = window.getComputedStyle(desc[k]);
        const width = style.getPropertyValue("max-width");
        desc[k].style.width = `${width - indent}%`;
      }
    }
  }

  /**
   * builds sidebar dropdown to allow user to select which files (searches) to
   * display returned product cards for.
   */
  async function search() {
    try {
      let res = await fetch('/files');
      await statusCheck(res);
      let data = await res.json();

      let parent = qs("select");
      
      for (let i = 0; i < data.length; i++) {
        let name = data[i].split(".")[0];
        let option = gen("option");
        option.value = name;
        option.textContent = name;
        parent.appendChild(option);
      }

      let all = gen("option");
      all.value = "all";
      all.textContent = "all files";

      qsa("option")[0].selected = true;
      parent.appendChild(all);
      
    } catch (err) {
      console.error('get data: ' + err); 
    }
  }

  /**
   * hides non-selected search file contents.
   */
  function hideSections() {
    let selection = qs("select").value;
    let sections = qsa("#items > section");
    let filename = selection.split(" ").join("-");
    if (selection !== "all") {
      for (let i = 0; i < sections.length; i++) {
        if (sections[i].id !== filename) {
          sections[i].classList.add('hidden');
        } else {
          sections[i].classList.remove('hidden');
        }
      }
    } else {
      for (let i = 0; i < sections.length; i++) {
        sections[i].classList.remove('hidden');
      };
    }
  }

  /**
   * based upon the selected file to show contents for, changes the title of the
   * sidebar.
   */
  function sidebarTitle() {
    let selection = qs("select").value;
    qs("#results-desc > h1").textContent = selection;
  }

  /**
   * dynamically add checkboxes to sidebar to filter cards by boost applied
   * @param {String} boost - the boost to be filtered on
   */
  function sidebarOption(boost) {
    // check that boost is not already on list
    if (id(`check-${boost}`)) {
      return;
    }

    let div = gen('div');

    let input = gen('input');
    input.type = 'checkbox';
    input.id = `check-${boost}`;
    input.addEventListener('change', (e) => {
      if (e.target.checked) {
        filterCards(boost);
      } else {
        unfilterCards(boost);
      }
    });

    boost = boost.split("-").join(" ");

    let label = gen('label');
    label.for = input.id;
    label.textContent = boost;

    div.appendChild(input);
    div.appendChild(label);

    const parent = id("options");
    parent.appendChild(div);

    const style = window.getComputedStyle(parent);
    qs('svg').style.height = style.getPropertyValue('height');
  }

  /**
   * filters the displayed cards based on the boost applied to them.
   * @param {String} boost - the boost to filter
   */
  function filterCards(boost) {
    let filter = qs('input[type=radio]:checked').id;
    if (filter === "exclude") {   // exclude only cards with the boost
      let cards = qsa(`.${boost}`);
      for (let i = 0; i < cards.length; i++) {
        cards[i].classList.add('hide-boost');
      }
    } else {                     // include only cards with the boost
      let cards = qsa(`.product-card :not(.${boost}) :not(.title-card)`);
      for (let i = 0; i < cards.length; i++) {
        cards[i].classList.add('hide-boost');
      }
    }
  }

  /**
   * reverts applied filter based on boost.
   * @param {String} boost - the boost to remove the filter for
   */
  function unfilterCards(boost) {
    let filter = qsa(`.${boost} .hide-boost`);
    for (let i = 0; i < filter.length; i++) {
      filter[i].classList.remove('hide-boost');
    }
  }

  // adjust offset of cards based on position in stack
  function offsetCards() {
    let sections = qsa('body > section');
    for (let i = 0; i < sections.length; i++) {
      //console.log(sections[i]);
      let products = qsa(`#${sections[i].id} > section`);
      for (let k = 0; k < products.length; k++) {
        let classname = products[k].classList[0];
        let cards = qsa(`.${classname} .product-card`);
        for (let m = 0; m < cards.length; m++) {
          let move = m * 10;
          cards[m].style.transform = `translateX(-${move}px)`;
          console.log(cards[m]);
        }
      }
    }
  }

  /**
   * reads the cleaned details data from files in order to build the card
   * dropdowns.
   * @param {String} filename 
   * @returns 
   */
  async function readDetails(filename) {
    try {
      let res = await fetch('/clean/details/' + filename);
      await statusCheck(res);
      let data = await res.json();
      return data;
    } catch (err) {
      console.error('get data: ' + err); 
    }
  }

  /* ----- Helpers & wrappers ----- */

  async function statusCheck(response) {
    if (!response.ok) {
      throw new Error(await response.text());
    }
    return response;
  }

  function id(idName) {
    return document.getElementById(idName);
  }

  function qs(query) {
    return document.querySelector(query);
  }

  function qsa(query) {
    return document.querySelectorAll(query);
  }

  function gen(tag) {
    return document.createElement(tag);
  }
})();