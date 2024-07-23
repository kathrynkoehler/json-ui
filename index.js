/**
 * Responsible for building interface. 
 * Allows user to submit authentication credentials to allow server access.
 * Requests data from server, then parses it into a more readable format, which
 * is then displayed on the interface in the form of "card decks" for each
 * returned product. 
 */
'use strict';

(function () {

  window.addEventListener('load', init);

  // holds current jwt
  let jwt;

  // api constants
  const API_URL = 'https://lululemon-dev.c.lucidworks.cloud';
  const APPID = 'LLM_us';

  // holds extracted product information from cleaned json files
  let allProducts = {};
  let allDetails = {};

  /**
   * initializes the page upon load. 
   */
  async function init() {
    try {
      // prep login to authenticate new jwt
      let auth = qs('#auth form');
      auth.addEventListener('submit', async (e) => {
        e.preventDefault();
        await authenticateJWT(e);
        auth['username'].value = '';
        auth['password'].value = '';
      });
      let signin = id('signin');
      signin.addEventListener('click', () => {
        auth.classList.toggle('hidden');
        qs('#auth p').classList.toggle('hidden');
      });
      qs('#error img').addEventListener('click', () => {
        id('error').classList.add('hidden');
      });

      // prep searchbar to query api
      id('search-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await loadPage(e);
      });
    } catch (err) {
      console.error('init ' + err);
    }
  }

  /**
   * Shows an informative error message to user when JWT authentication or
   * API query fails.
   * @param {String} message - en explanation of where the error occurred
   * @param {String} err - the error returned by the server
   */
  function handleError(message, err) {
    id('items').innerHTML = '';
    id('items').classList.add('hidden');
    let display = qs('#error p');
    display.textContent = message + err;
    id('error').classList.remove('hidden');
  }

  /**
   * when user submits their username and password, request to authenticate
   * new JWT token is sent to server.
   */
  async function authenticateJWT() {
    try {
      let user = qs('#auth form')['username'].value;
      let password = qs('#auth form')['password'].value;
      await refreshJwt(API_URL, user, password);
    } catch (err) {
      console.error(err);
    }
  }

  /**
   * refreshes current jwt, obtaining new from fusion rest api and schedules
   * method to run again before jwt expires
   * @param {String} apiUrl - the url to query
   * @param {String} user - the username to authenticate
   * @param {String} password - the password to authenticate
   */
  async function refreshJwt(apiUrl, user, password) {
    const loginUrl = `${apiUrl}/oauth2/token`;
    const auth = btoa(`${user}:${password}`);
    const authHeader = `Basic ${auth}`;

    // execute fetch to get jwt
    try {
      const response = await fetch(loginUrl, {
        method: 'POST',
        headers: { 'Authorization': authHeader }
      });
      await statusCheck(response);
      const responseJSON = await response.json();
      jwt = responseJSON['access_token'];
      const secondsUntilExpiration = parseInt(responseJSON['expires_in']);

      qs('#auth form').classList.toggle('hidden');
      qs('#auth p').classList.toggle('hidden');
      qs('#error').classList.add('hidden');

      // reschedule before jwt expires
      const graceSeconds = secondsUntilExpiration > 15 ? 10 : 2;
      const secondsUntilRefresh = secondsUntilExpiration - graceSeconds;
      setTimeout(async () => {
        await refreshJwt(apiUrl, user, password);
      }, secondsUntilRefresh * 1000);
    } catch (err) {
      console.error('Attempt to retrieve JWT token failed due to exception. Exiting...', err);
      handleError('Error authenticating JWT: ', err);
    }
  }

  /**
   * retrieves cleaned product data to build interface and handle interactivity. 
   * @param {Event} e - the event triggering load (submit user/password)
   */
  async function loadPage(e) {
    try {
      // loading animations
      let items = id('items');
      items.innerHTML = '';
      let itemLoad = gen('div');
      itemLoad.classList.add('load-items');
      items.prepend(itemLoad);

      let circle = qs('#options svg');
      let circle2 = id('load-circle');
      circle.classList.remove('hidden');
      circle2.classList.remove('hidden');

      // query data from api, then display on page
      await queryData(e);
      await displayData();
      
      // when all data is displayed, remove loading icons
      circle.classList.add('hidden');
      circle2.classList.add('hidden');
      qs('#items .load-items').remove();
    } catch (err) {
      console.error('Error in loadPage:', err);
    }
  }

  /**
   * queries data directly from api.
   * @param {Event} e - the event triggering the query (user/password submit)
   */
  async function queryData(e) {
    e.preventDefault();
    try {
      // authenticate current jwt by adding it in auth header
      id('items').innerHTML = '';
      const headers = {
        'Authorization': `Bearer ${jwt}`
      };

      // get the search string, query api
      let search = id('searchbar').value;
      search = search.split(' ').join('%20');
      const queryURL = `/api/apps/${APPID}/query/${APPID}?q=${search}&debug=results&debug.explain.structured=true`;
      let res = await fetch(API_URL + queryURL, { headers });
      await statusCheck(res);
      res = await res.json();         // this is the new "dirty" data to parse
      id('error').classList.add('hidden');
      decomposeSKU(res);
    } catch (err) {
      console.error('Error in queryData: ' + err);
      handleError('Error querying API: ', err);
      qs('#signin').classList.add('active');
      setTimeout(() => {
        qs('#signin').classList.remove('active');
      }, 5000);
    }
  }

  /*
    ************** decompose response from api **************
  */

  /**
   * Decomposes the JSON from the original data, extracting useful fields
   * to save for each listed product. Also extracts score details and saves
   * those breakdowns.
   * @param {Object} data - the JSON data to parse
   */
  function decomposeSKU(data) {
    const skus = data["debug"]["explain"];
    let value;
    allProducts = {};
    allDetails = {};

    Object.keys(skus).forEach(item => {
      let [skuId, prodId] = item.split('_');
      value = skus[item].value;

      // check if product id already has an object
      let array = setData(data, prodId, skuId);
      if (!array) return;

      if (!allProducts[prodId]) {
        allProducts[prodId] = {
          'productId': prodId,
          'displayName' : array[0],
          'size': array[1],
          'prodImg': array[2],
          'skus': {}
        }
      }
      allProducts[prodId]['skus'][skuId] = {
        'skuScore': value, 
        'skuImg': array[3],
      };
      
      // extract details for every sku_prodid item
      allDetails[item] = [];
      // account for the first score not being nested inside a 'details' object
      allDetails[item].push([1, skus[item]['description'], skus[item]['value']]);
      traverseDetails(1, item, (skus[item]));
    });
  }

  /**
   * Grabs the image and displayName from "response" "docs" object in the JSON.
   * Saves these as an array that will later be saved in the "cleaned" data object.
   * If the full SKU details are listed, additionally save the specific SKU
   * image.
   * @param {Object} data - the JSON to parse
   * @param {String} productId - the productId
   * @param {String} skuId - the skuId
   * @returns array of displayname + image for each product
   */
  function setData(data, productId, skuId) {
    let docs = data["response"]["docs"];
    
    // for each product, find details list
    let item;
    for (item of docs) {
      if (item["product_id"] === productId) {
        let array = [item["product_displayName"],   // object[0]
            item["sku_size"],                       // object[1]
            item["sku_skuImages"][0],               // object[2] (prod img)
          ];
        let skuslist = item["style_order_list"];
        for (let i = 0; i < skuslist.length; i++) {
          if (skuslist[i]["sku_id"] === skuId) {
            array.push(
              skuslist[i]["sku_skuImages"][0]       // object[3]
            );
            return array;                   // exit early if sku details found
          }
        }
        return array;                       // exit early when item found
      }
    }
  }

  /**
   * Recursive function traverses the nested JSON object containing the score
   * breakdown for each item. The score value and description are saved into an
   * array, along with the depth of that score in the nested JSON object. 
   * @param {Number} depth - the current depth of the nested object
   * @param {String} prodId - the ID of the product's score being parsed
   * @param {Object} item - the JSON object being traversed
   * @returns the array of score depth + description + value for each nested object
   */
  function traverseDetails(depth, prodId, item) {
    // for each field in json, check if it's 'details'
    let object = [];
    Object.keys(item).forEach(key => {
      // if details, pull out the score and description
      if (typeof item[key] === 'object' && item[key] !== null) {
        // pull out all scores at that depth
        if (key === 'details'){
          let short = item["details"];
          for (let i = 0; i < short.length; i++) {
            allDetails[prodId].push([depth+1, short[i]["description"], short[i]["value"]]);
            // then check for more details
            traverseDetails(depth+1, prodId, short[i]);
          }
          // when finished with one object, do the other nested ones too
          traverseDetails(depth, prodId, item["details"]);
        }
      } else {
        return object;
      }
    });
  }

  /*
    ************** create interface from data **************
  */

  /**
   * displays the data retrieved from the api. called when queryData() completes
   */
  async function displayData() {
    try {
      // build card decks, change title to match query
      id('items').classList.remove('hidden');
      await buildInterface();

      // enable filtering on boosts
      id('filter-btn').addEventListener('click', filterCards);
      id('unfilter-btn').addEventListener('click', unfilterCards);
    } catch (err) {
      console.error('displayData ' + err);
    }
  }

  /**
   * adds all cards to page.
   */
  async function buildInterface() {  // TODO: change from for/of loops for performance
    try {
      qs('#scores').innerHTML = '';
      qs('#checklist').innerHTML = '';
      let search = id('searchbar').value;
      search = search.split(" ").join("-");

      // build section within #items to contain decks
      addHeader(search);

      // for each product in file, create card stack
      for (const product of Object.values(allProducts)) {
        addProductSection(product, search);

        // for each sku in product, create card with image, score
        let count = Object.keys(product['skus']).length;
        for (const [sku, skuData] of Object.entries(product['skus'])) {
          await addCard(product,              // data
            skuData['skuScore'],              // value
            skuData,                          // skudata
            sku,                              // sku
            search,                           // section
            count--);                         // number
        }

        // create the title card for the front of the stack
        addProductCard(product['skus'],    // data
          product['productId'],            // prodid
          product['displayName'],          // displayname
          product['prodImg'],              // image
          search);                         // section
      }
      sidebarTitle();
    } catch (err) {
      console.error('Error in buildInterface ', err);
    }
  }

/**
 * add new section within #items for search query
 * @param {String} search - the query string
 */
  function addHeader(search) {
    try {
      let section = gen('section');
      section.id = search;

      let load = gen('div');
      load.classList.add('load-items', 'loading');
      section.appendChild(load);

      let parent = id("items");
      parent.appendChild(section);
    } catch (err) {
      console.error('Error in addHeader: ', err);
    }
  }

  /**
   * put each product in its own deck within the file card list
   * @param {Object} product - JSON object of product details
   * @param {String} search - the search the item was returned from. used to
   *          place the section on the page
   */
  function addProductSection(product, search) {
    try {
      let section = gen('section');
      section.classList.add(product['productId'], 'product-container');
      
      // spacers that isolate the deck when spread
      let spacer1 = gen('div');
      let spacer2 = gen('div');
      
      let parent = id(`${search}`);
      parent.appendChild(section);
      section.insertAdjacentElement('beforebegin', spacer1);
      section.insertAdjacentElement('afterend', spacer2);
    } catch (err) {
      console.error('Error in addProductSection: ', err);
    }
  }

  /**
   * add title product card to card stack
   * @param {Object} data - JSON object of product data
   * @param {String} productId - ID of product
   * @param {String} displayName - Display name of product
   * @param {String} image - the image of the product
   * @param {String} search - query the item was returned from
   */
  function addProductCard(data, productId, displayName, image, search) {
    try {
      // add product photo
      const photoDiv = gen('div');
      photoDiv.classList.add('photo');
      const photo = gen('img');
      photo.src = image;
      photo.alt = displayName;
      photoDiv.appendChild(photo);

      // add aggregate scores from skus
      let scores = productScores(data);
      
      const title = gen('h1');
      title.textContent = displayName;
      title.classList.add("card-search");
      const prodId = gen('h2');
      prodId.textContent = 'ID: ' + productId;
      const max = gen('h2');
      max.textContent = `Score maximum: ${scores[1]}`;
      const count = gen('h2');
      count.textContent = `SKU count: ${scores[0]}`;

      const contents = gen('div');
      contents.classList.add('card-contents');
      contents.append(title, prodId, max, count);

      const article = gen('article');
      article.classList.add('product-card', 'title-card');
      article.append(photoDiv, contents);

      const prodContainer = qs(`#${search} .${productId}`);
      prodContainer.prepend(article);

      article.addEventListener('click', (e) => {
        spreadDeck(e);
      });
    } catch (err) {
      console.error('Error in addProductCard: ', err);
    }
  }

  /**
   * Calculates a product's maximum score from SKU data and counts amount of
   * SKUs in deck.
   * @param {Object} product - JSON object of SKU data.
   * @returns Array of numbers for various calculated aggregates
   */
  function productScores(product) {
    let skuCount = 0;
    let maxScore = 0;

    for (const sku of Object.values(product)) {
      let current = parseFloat(sku['skuScore']);
      if (current > maxScore) maxScore = current;
      skuCount ++;
    }
    return [skuCount, maxScore];
  }

  /**
   * build and add SKU card to page.
   * @param {Object} data - JSON object containing data about the item
   * @param {Number} value - total score of SKU
   * @param {Array} skuData - details object for SKU, used to retrieve image
   * @param {String} sku - the SKUId of the item
   * @param {String} search - the query the product was returned from. used to 
   *                  place the card on the page
   * @param {Number} number - the order of this card in the deck
   */
  async function addCard(data, value, skuData, sku, search, number) {
    try {
      // the card that we'll assemble below
      const card = gen('article');
      card.classList.add('product-card');

      const prodContainer = qs(`#${search} .${data['productId']}`);
      prodContainer.prepend(card);
      const productId = sku + '_' + data['productId'];

      // add photo
      const photoDiv = gen('div');
      photoDiv.classList.add('photo');
      const photo = gen('img');
      if (skuData['skuImg']) {
        photo.src = skuData['skuImg'];
      } else {
        photo.src = data['prodImg'];
      }
      photo.alt = data['displayName'];
      photoDiv.appendChild(photo);
      
      // add title, productID, SKUID, overall score
      const title = gen('h1');
      title.textContent = data['displayName'];
      const prodId = gen('h2');
      prodId.textContent = `ID: ${productId}`;
      const order = gen('p');
      order.textContent = number;
      const score = gen('h2');
      score.textContent = `Score: ${value}`;
      
      // score details button + list
      const dropDownButton = gen('button');
      dropDownButton.textContent = 'SCORE DETAILS';
      dropDownButton.classList.add('collapsible');
      let scores = scoreList(productId, card);
      const dropDownContainer = scores;
      dropDownContainer.classList.add('hidden');
      const summary = scoreSummary(scores);
      photoDiv.appendChild(summary);
      
      dropDownButton.addEventListener('click', () => {
        // handle sidebar score details
        dropDownButton.classList.toggle('active');
        let sidebarDropDown = id(`${productId}-scorelist`);
        if (sidebarDropDown) {
          sidebarDropDown.parentElement.classList.remove('hidden');
          sidebarDropDown.previousElementSibling.classList.toggle('active');
          sidebarDropDown.classList.toggle('hidden');
        } else {
          sidebarScores(dropDownContainer, productId);
          dropDownContainer.classList.remove('hidden');
        }
        // handle score summary on sku card
        photo.classList.toggle('hidden');
        summary.classList.toggle('hidden');
      });

      const contents = gen('div');
      contents.classList.add('card-contents');
      contents.append(title, prodId, order, score, dropDownButton);
      card.append(photoDiv, contents);
    } catch (err) {
      console.error(err);
    }
  }

  /**
   * adds the score breakdown to a card. called from addCard()
   * @param {String} itemId - full SKU_ProductID of the item whose details we need
   * @param {HTMLElement} card - the card the details are being added to. passed
   *          in so the boost classes can be applied
   * @returns {HTMLElement} completed container element for score dropdown
   */
  function scoreList(itemId, card) {
    const dropDownContainer = gen('article');
    dropDownContainer.classList.add('content');
    dropDownContainer.classList.add('hidden');
    dropDownContainer.id = itemId + '-scorelist';

    // find the item we need in allDetails
    const item = allDetails[itemId];
    // for each score in item, add to item dropdown
    for (const score in item) {
      const drop = createScoreDetail(item[score]);
      appendScoreDetail(dropDownContainer, drop, item[score]);
      addBoostClass(card, item[score], drop);
    }
    return dropDownContainer;
  }

  /**
   * Create a score detail element for the sidebar breakdown.
   * @param {Array} scoreDetail - array containing score description, value, 
   *          and depth.
   * @returns {HTMLElement} the score detail element.
   */
  function createScoreDetail(scoreDetail) {
    const drop = gen('details');
    const summary = gen('summary');
    const div = gen('div');
    
    let indent = `indent-${scoreDetail[0]}`;
    const description = gen('p');
    description.textContent = scoreDetail[1];
    description.classList.add("detail-desc");
    const value = gen('p');
    value.textContent = scoreDetail[2];
    value.classList.add("detail-val");

    div.append(description, value);
    summary.appendChild(div);
    drop.appendChild(summary);
    drop.classList.add(indent);

    return drop;
  }

  /**
   * Append a score detail element to the appropriate parent element.
   * @param {HTMLElement} dropDownContainer - the parent element to append to.
   * @param {HTMLElement} drop - tthe score detail element to append.
   * @param {Array} scoreDetail - array containg score details.
   */
  function appendScoreDetail(dropDownContainer, drop, scoreDetail) {
    const indentLevel = parseInt(scoreDetail[0]);
    let lastChild = dropDownContainer.querySelectorAll('details');
    let parent = lastChild[lastChild.length-1];

    if (lastChild.length > 0) {
      while (parent) {
        const depth = parseInt(parent.classList.value.split("-")[1]);
        if (depth < indentLevel - 1) {  // if not deep enough, go deeper
          lastChild = parent.querySelectorAll('details');
          parent = lastChild[lastChild.length-1];
        } else if (depth === indentLevel - 1) {   // if correct depth, append
          parent.appendChild(drop);
          return;
        } else {  // if too deep, reverse
          parent = parent.parentNode;
        }
      }
    } else {    // if nothing in list yet, add
      dropDownContainer.appendChild(drop);
    }
  }

  /**
   * Add boost classes to the card for filtering purposes.
   * @param {HTMLElement} card - the card element to add classes to.
   * @param {Array} scoreDetail - array containing score details.
   * @param {HTMLElement} drop - the score detail element.
   */
  function addBoostClass(card, scoreDetail, drop) {
    const description = scoreDetail[1];
    if (description === "boost") {
      const boostName = getBoostName(drop);
      const boostClass = `${boostName}-boost-${scoreDetail[2]}`;
      card.classList.add(boostClass);
      card.parentElement.classList.add(boostClass);
      sidebarOption(boostClass);
      drop.classList.add('scoreboost');
    } else if (description.includes('idf, computed as')) {
      drop.classList.add('scoreidf')
    } else if (description.includes('tf, computed as')) {
      drop.classList.add('scoretf')
    } else {
      const baseDescription = description.split('(')[0];
      if (baseDescription === 'weight') {
        drop.classList.add('scoreweight');
      } else if (baseDescription === 'max of:') {
        drop.classList.add('scoremax');
      } else if (baseDescription === 'query') {
        drop.classList.add('scorequery');
      }
    }
  }

  /**
 * Get the boost name from the score detail element.
 * @param {HTMLElement} drop - The score detail element.
 * @returns {String} The boost name.
 */
  function getBoostName(drop) {
    try {
      let context = drop.closest('details.scoreweight');
      if (context) {
        context = context.childNodes[0].childNodes[0];
        let name = context.childNodes[0].textContent;
        let boostName = (name.split(' ')[0]).split(':')[1];
        if (boostName[0] === '"') {
          boostName = (name.split('"')[1]).split(' ').join('-');
        } else if (boostName === 'true') {
          boostName = name.split(':')[0].split('_')[1];
        }
        return boostName;
      }
    } catch (err) {
      console.error('Error in getBoostName:', err);
    }
  }

  /**
   * pull out the core details of the score breakdown for display on each
   * SKU card.
   * @param {HTMLElement} list - the existing full score breakdown of nested <details>
   *          elements.
   * @returns {HTMLElement} div containing the pared-down list of 
   *           core score details.
   */
  function scoreSummary(list) {
    let div = gen('div');
    div.classList.add('hidden', 'content');
    let title = gen('h3');
    title.textContent = 'Score Components';
    let tooltip = scoreTooltip();
    title.append(tooltip);

    let formula = scoreFormula(list, ' = ');
    formula = scoreFormulaFormat(formula);
    let calculation = gen('p');
    calculation.textContent = formula;
    div.append(title, calculation);
    
    // traverse list and look for "max of:" calculations
    let max = list.querySelectorAll('.scoremax');
    max.forEach(maxElement => {
      // set the max value we're looking for in the weights it contains
      let target = maxElement.querySelector('details > summary > div > p.detail-val').textContent;
      let weights = maxElement.querySelectorAll('.scoreweight');
      weights.forEach(weight => {
        // if the value matches, save this weight for the card summary
        let val = weight.querySelector('details > summary > div > p.detail-val').textContent;
        if (val === target) {
          let copy = weight.cloneNode(true);
          copy.querySelector('details > summary > div > p.detail-desc').textContent = 
          copy.querySelector('details > summary > div > p.detail-desc').textContent.split(' [')[0];
          div.append(scoreRewrite(copy));
        }
      });
    });
    // check for weights that weren't taken as a maximum
    let outerWeights = list.querySelectorAll('.scoreweight');
    outerWeights.forEach(weight => {
      let indent = weight.classList.value.split('-')[1][0];
      let parent = (weight.parentNode);
      let parentText = parent.childNodes[0].childNodes[0].textContent.split(' ')[0];
      if (indent !== '1' && parentText !== "max") {
        let copy = weight.cloneNode(true);
        copy.querySelector('details > summary > div > p.detail-desc').textContent = 
        copy.querySelector('details > summary > div > p.detail-desc').textContent.split(' [')[0];
        div.append(scoreRewrite(copy));
      }
    });
    // check for the query constant multiplier
    let query = list.querySelector('.scorequery');
    if (query) {
      let copy = query.cloneNode(true);
      copy.querySelector('details > summary > div > p.detail-desc').textContent = 'Query constant'
      div.append(copy);
    }
    return div; 
  }

  /**
   * Extracts the top-level operations from the score components to show a
   * simplified calculation on each SKU card's breakdown.
   * @param {HTMLElement} list - the full score list
   * @param {String} type - the character to concatenate the operation with
   * @returns 
   */
  function scoreFormula(list, type) {
    // hunt for "product of" and "sum of" calculations
    let formula = [];
    let components = list.querySelectorAll(':scope > details');
    // console.log(list, components);
    for (let i = 0; i < components.length; i++) {
      let description = components[i].querySelector('div > p.detail-desc').textContent;
      // check if it's a product
      if (description.includes('product of')) {
        formula.push(scoreFormula(components[i], '*'));
      } else if (description.includes('sum of')) {
        formula.push('(', scoreFormula(components[i], '+'), ')');
      } else {
          // if not a sum or a product, just add the value
          let value = components[i].querySelector('div > p.detail-val').textContent;
          if (description.includes('weight') && description.length > 100) {
            formula.push(value, type);
            formula.push(scoreFormula(components[i], '&'));
          } else {
            formula.push(type, value);
          }
        }
      }
    return formula;
  }

  /**
   * Formats the nested array from scoreFormula() into a readable string.
   * Called from scoreSummary.
   * @param {Array} formula - the nested array to format
   * @returns {String} the complete calculation represented as a String
   */
  function scoreFormulaFormat(formula) {
    formula = formula.flat(Infinity);
    formula = formula.join(' ');
    formula = formula.replace('( + ', '(');
    formula = formula.replace(' )', ')');
    return formula;
  }
  
  /**
   * Create a tooltip for the SKU score summary that explains TFIDF values.
   * Called from scoreSummary().
   */
  function scoreTooltip() {
    let tooltip = gen('div');
    tooltip.classList.add('tooltip');
    let info = gen('img');
    info.src = './img/info.png';
    info.alt = 'Read more';
    let explain = gen('p');
    explain.textContent = `Each category weight is calculated by multiplying \
    boost * idf * tf. TFIDF (term frequency, inverse document frequency) \
    represents the relative concentration of the weighted term in the document \
    (item).`;
    explain.classList.add('tooltiptext');
    tooltip.append(info, explain);
    return tooltip;
  }

  /**
   * Format the score components pulled out of the full list in scoreSummary().
   * @param {HTMLElement} node - the copy of the score dropdown to further
   *          explain.
   * @returns {HTMLElement} new element consisting of nested details with explanations
   *            for each component of a score.
   */
  function scoreRewrite(node) {
    // break apart the copy of the dropdown, create new elements
    let heading = node.childNodes[0].childNodes[0];
    let newWeight = gen('details');
    let newSummary = gen('summary');
    newSummary.append(heading);
    newWeight.append(newSummary);

    // split apart the category and term from the weight heading
    let category = heading.childNodes[0].textContent.split(':');
    let term = category[1].split(' in')[0];

    // account for the event that several terms (synonyms) are weighted together
    if (category.length > 2) {
      let terms = [];
      for (let i = 1; i < category.length; i++) {
        terms.push(`${category[i].split(' ')[0].split(')')}`);
      }
      term = terms.join(', ');
      term = term.substring(0, term.length-1);
      category = category[0].split('(')[2];
    } else {
      category = category[0].split('(').slice(1).join('(');
    }

    // build the boost, idf, and tf elements
    let boost = node.querySelector('.scoreboost > summary > div > .detail-val');
    if (boost) {
      let newBoost = gen('details');
      let boostSummary = gen('summary');
      boostSummary.textContent = `boost = ${boost.textContent}`
      newBoost.append(boostSummary);
      newWeight.append(newBoost);
    }
    let idf = node.childNodes[1].querySelector('.scoreidf');
    let newIdf = createIdfDetail(idf, category, term);
    let tf = node.childNodes[1].querySelector('.scoretf');
    let newTf = createTfDetail(tf, category, term);

    newWeight.append(newIdf, newTf);
    return newWeight;
  }

  /**
   * Builds a dropdown for the IDF component of a weighted term's score. Called
   * from scoreRewrite().
   * @param {HTMLElement} idf - the original idf element to break down.
   * @param {String} category - the weighted category.
   * @param {String} term - the weighted term.
   * @returns {HTMLElement} new idf details dropdown.
   */
  function createIdfDetail(idf, category, term) { // TODO: factor out redundancy
    // build the idf element
    let idfscore = idf.querySelector('div > p.detail-val').textContent;
    let newIdf = gen('details');
    let idfSummary = gen('summary');
    idfSummary.textContent = `idf = ${idfscore}`;
    newIdf.append(idfSummary);
    
    // check whether idf is a single calculation, or sum of several idfs
    if (!(idf.childNodes[0].querySelector('div > p.detail-desc').textContent).includes("sum of")) {
      let smallN = idf.childNodes[1].querySelector('div > p.detail-val').textContent;
      let bigN = idf.childNodes[2].querySelector('div > p.detail-val').textContent;
      let idfExplain = gen('p');
      idfExplain.innerHTML = `The number of documents searched (N) is \
      <span>${bigN}</span>, and the number where the field \
      <span>${category}</span> contains <span>${term}</span> (n) is \
      <span>${smallN}</span>.`;
      newIdf.append(idfExplain);
    } else {
      // if idf is a sum, add all to dropdown
      let sumIdf = gen('p');
      sumIdf.textContent = 'This idf is a sum of the following:';
      newIdf.append(sumIdf);
      for (let i = 1; i < idf.childNodes.length; i++) {
        let current = idf.childNodes[i];
        idfscore = current.querySelector('div > p.detail-val').textContent;
        let nestIdf = gen('details');
        let idfNestSummary = gen('summary');
        idfNestSummary.textContent = `idf = ${idfscore}`;

        let smallN = current.childNodes[1].querySelector('div > p.detail-val').textContent;
        let bigN = current.childNodes[2].querySelector('div > p.detail-val').textContent;
        let idfExplain = gen('p');
        idfExplain.innerHTML = `The number of documents searched (N) is \
        <span>${bigN}</span>, and the number where the field \
        <span>${category}</span> contains <span>${term}</span> (n) is \
        <span>${smallN}</span>.`;

        nestIdf.append(idfNestSummary, idfExplain);
        newIdf.append(nestIdf);
      }
    }
    return newIdf;
  }

  /**
   * Builds a dropdown for the TF component of a weighted term's score. Called
   * from scoreRewrite().
   * @param {HTMLElement} tf - the original tf element to break down.
   * @param {String} category - the weighted category.
   * @param {String} term - the weighted term.
   * @returns {HTMLElement} new tf details dropdown.
   */
  function createTfDetail(tf, category, term) {
    // pull out the values for each tf score component
    let tfscore = tf.childNodes[0].querySelector('div > p.detail-val').textContent;
    let freq = tf.childNodes[1].querySelector('div > p.detail-val').textContent;
    let k1 = tf.childNodes[2].querySelector('div > p.detail-val').textContent;
    let b = tf.childNodes[3].querySelector('div > p.detail-val').textContent;
    let dl = tf.childNodes[4].querySelector('div > p.detail-val').textContent;
    let avgdl = tf.childNodes[5].querySelector('div > p.detail-val').textContent;

    // build the element
    let newTf = gen('details');
    let tfSummary = gen('summary');
    tfSummary.textContent = `tf = ${tfscore}`;
    let tfExplain = gen('p');
    tfExplain.innerHTML = `The term <span>${term}</span> occurs <span>${freq}</span>\
    time(s) within the document. Values of <span>${k1}</span> (k1) and\
    <span>${b}</span> (b) are applied to normalize the result based on expected
    document relevance and specificity. The length of the <span>${category}</span>\
    field (dl) is <span>${dl}</span> and the average length of this field (avgdl)\
    is <span>${avgdl}</span>.`;

    newTf.append(tfSummary, tfExplain);
    return newTf;
  }

  /**
   * when a deck is clicked on, spreads the associated SKU cards beneath title
   * card out onto the page. 
   * @param {Event} e - click event triggering function call. allows function to 
   *                identify the clicked product title card.
   */
  function spreadDeck(e) {
    let section = e.currentTarget.parentElement;

    // only allow one deck to be spread at a time. remove spacer elements
    let spread = qs('.product-container.spread');
    if (spread) {
      spread.previousSibling.classList.remove('spread');
      spread.nextSibling.classList.remove('spread')
      spread.classList.remove('spread');
      if (spread === section) {
        return;
      }
    }

    // spread the new deck
    section.classList.add('spread');
    section.previousSibling.classList.add('spread');
    section.nextSibling.classList.add('spread')

    // give the spacers a moment to transition
    setTimeout(() => {
      // make sure the page view follows the new element location
      section.scrollIntoView({behavior: 'smooth', block: 'center'});
    }, 300);
  }

  /**
   * based upon the selected file to show contents for, changes the title of the
   * sidebar.
   */
  function sidebarTitle() {
    let search = id('searchbar').value;
    qs("#results-desc > h1").textContent = search;

    // show how many products are returned
    search = search.split(' ').join('-');
    let count = qsa(`#${search} > section`).length;
    let span = qs('#results-desc span');
    span.textContent = count;
  }

  /**
   * add selected card's score breakdown to sidebar list.
   * @param {Element} scorelist - the container holding the score breakdown for
   *                  the selected card.
   * @param {String} title - the product the scores correspond to
   */
  function sidebarScores(scorelist, title) {
    let sidebar = id('scores');

    let container = gen('div');
    let heading = gen('h2');

    let label = gen('span');
    label.textContent = title;
    label.classList.add('category', `${title}`);
    let icon = gen('img');
    icon.src = './img/x.png';

    heading.append(label, icon);
    heading.classList.add('active');
    heading.addEventListener('click', () => {
      // heading.classList.toggle('active');
      let content = heading.nextElementSibling;
      content.classList.toggle('hidden');
      heading.classList.toggle('active');
    });
    icon.addEventListener('click', () => {
      // (icon.parentNode).parentNode.remove();
      (icon.parentNode).parentNode.classList.toggle('hidden');
    });

    container.append(heading, scorelist);
    sidebar.appendChild(container);
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

    // build new checkbox input and label for boost
    let div = gen('div');
    let input = gen('input');
    input.type = 'checkbox';
    input.id = `check-${boost}`;
    boost = boost.split("-boost-");
    boost = boost[0].split('-').join(' ') + ': ' + boost[1];
    let label = gen('label');
    label.for = input.id;
    label.textContent = boost;
    div.append(input, label);
    const parent = id("checklist");
    parent.appendChild(div);

    // resize the loading svg to cover all input elements
    const style = window.getComputedStyle(id('options'));
    qs('#options > svg').style.height = style.getPropertyValue('height');
    // TODO: adjust height to entirely cover
  }

  /**
   * filters the displayed cards based on the boost applied to them.
   */
  function filterCards() {
    let type = qs('input[type=radio]:checked').id;
    let filters = qsa('#filter input[type=checkbox]:checked');
    
    if (type === "exclude") {   
      // for each selected boost, exclude only cards with that boost
      for (let i = 0; i < filters.length; i++) {
        let boost = (filters[i].id).split('-').slice(1).join('-');
        let cards = qsa(`.${boost}`);
        for (let i = 0; i < cards.length; i++) {
          cards[i].classList.add('hide-boost');
        }
      }
    } else {    
      // for each selected boost, exclude only cards without that boost        
      for (let i = 0; i < filters.length; i++) {
        let boost = (filters[i].id).split('-').slice(1).join('-');
        let cards = qsa(`.product-container:not(.${boost}`);
        for (let i = 0; i < cards.length; i++) {
          cards[i].classList.add('hide-boost');
        }
        // and make sure cards WITH the boost are included
        cards = qsa(`.${boost}`);
        for (let i = 0; i < cards.length; i++) {
          cards[i].classList.remove('hide-boost');
        }
      }
    }
  }

  /**
   * clears all applied filters and filter selections.
   */
  function unfilterCards() {
    let type = qs('input[type=radio]:checked');
    type.checked = false;

    let filters = qsa('#filter input[type=checkbox]:checked');
    for (let i = 0; i < filters.length; i++) {
      filters[i].checked = false;
    }

    let filter = qsa(`.hide-boost`);
    for (let i = 0; i < filter.length; i++) {
      filter[i].classList.remove('hide-boost');
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