<?php
class ControllerExtensionModuleSupplierUpdates extends Controller {
  public function index() {
    /**
     * BASIC SETUP
     */
    // load language
    //$this->load->language('extension/module/supplier_updates');

    // Set info
    // $data['heading_title'] = $this->language->get('heading_title');
    $this->document->setTitle('Supplier Updates');

    // Load Settings
    $this->load->model('setting/setting');

    /**
     * SCRIPTS
     */
    //$this->document->addScript('https://unpkg.com/vue@3/dist/vue.global.js');
    //$this->document->addScript('view/javascript/supplier_updates.js');

    /**
     * GRAB COMMON VIEWS
     */
    $data['header'] = $this->load->controller('common/header');
    $data['column_left'] = $this->load->controller('common/column_left');
    $data['footer'] = $this->load->controller('common/footer');
    $data['app'] = $this->loadApp();

    /**
     * RETURN
     */
    $this->response->setOutput($this->load->view('extension/module/supplier_updates', $data));
  }

  /**
   * APIS: Testing function
   */
  public function hellothere(){
    // return data
    $this->response->setOutput(json_encode(array('data' => $this->session)));
  }
  /**
   * APIS: Get products by SKU
   */
  public function getProductsBySku(){
    // load models 
    $this->load->model('tool/image');

    // grab data from post
    $data = json_decode(file_get_contents('php://input'), true);

    // return if no data
    if(!$data || empty($data)){ 
      $this->response->setOutput( json_encode( array('error' => 'No post data') ) );
      return;
    }

    // get skus
    $skus = array_map(function($product){
      return $product['sku'];
    }, $data);

    // get skus ready for SQL
    $skuList = implode("','", $skus); // Join the SKUs with quotes

    // do the query
    try {
      $query = $this->db->query("
        SELECT p.image, p.cost, p.price, p.product_id, p.quantity, p.sku, pd.name 
        FROM " . DB_PREFIX . "product p 
        LEFT JOIN " . DB_PREFIX . "product_description pd ON (p.product_id = pd.product_id)
        WHERE p.sku IN ('$skuList')
      ");
    } catch(Exception $e){
      $this->response->setOutput( json_encode( array('error' => $e->getMessage()) ) );
      return;
    }

    $this->log->write('done the query');

    $products = array();
    // if ($query->num_rows) {
    //   $products = $query->rows;
    // }
    if ($query->num_rows) {
      foreach ($query->rows as $product) {

        // image changes
        if (is_file(DIR_IMAGE . $product['image'])) {
          $product['image'] = $this->model_tool_image->resize($product['image'], 40, 40);
        } else {
          $product['image'] = $this->model_tool_image->resize('no_image.png', 40, 40);
        }

        // find matching update
        $match = null; 
        foreach($data as $item){
          if($item['sku'] !== $product['sku']) continue;
          $match = $item;
          break;
        }
        if(!$match) continue;

        // add in new fields
        if(array_key_exists('soh', $match)){
          $product['quantity_new'] = $match['soh'];
        }
        $product['cost_new'] = $match['cost'];
        $product['update'] = true;
        $product['editing'] = array('status' => false, 'filter' => '');
        
        $products[] = $product;
      }
    }

    // return data
    $this->response->setOutput(json_encode(array('data' => $products)));
  }
  /**
   * APIS: Update Stock
   */
  public function updatestock(){

    // grab data from post
    $data = json_decode(file_get_contents('php://input'), true);

    // return if no data
    if(empty($data)){
      $this->response->setOutput(json_encode(array('error' => 'No post data')));
      return;
    }

    // get skus
    $skus = array_map(function($product){
      return $product['sku'];
    }, $data);

    // get skus ready for SQL
    $skuList = implode("','", $skus); // Join the SKUs with quotes

    // do the query
    $query = $this->db->query("
      SELECT p.image, p.price, p.product_id, p.quantity, p.sku
      FROM " . DB_PREFIX . "product p
      WHERE p.sku IN ('$skuList')
    ");

    // iterate over the results
    $products = array();
    if ($query->num_rows) {
      foreach ($query->rows as $product) {
        // find matching update
        $match = null; 
        foreach($data as $item){
          if($item['sku'] !== $product['sku']) continue;
          $match = $item;
          break;
        }
        if(!$match) continue;

        // check if quantity needs updating
        $update = ($product['quantity'] == $match['soh']) ? false : true;

        // update
        if($update){
          
          try{
            // DB call
            $dbUpdate = $this->db->query("
              UPDATE " . DB_PREFIX . "product
              SET quantity = '" . (int)$match['soh'] . "' 
              WHERE sku = '" . $this->db->escape($product['sku']) . "'
            ");

            if(!$dbUpdate){
              $product['updated'] = false;
              $product['updated_message'] = 'Could not update database';
            }
            // update product
            $product['updated'] = true;
            $product['quantity_old'] = $product['quantity'];
            $product['quantity'] = $match['soh'];
          }

          catch(Exception $e){
            $product['updated'] = false;
            $product['updated_message'] = $e->getMessage();
          }

        }

        else{
          $product['updated'] = false;
          $product['updated_message'] = 'Quantity did not need to be updated';
        }
        
        $products[] = $product;
      }
    }

    // return data
    $this->response->setOutput(json_encode(array('data' => $products)));
  }

  /**
   * APIS: Update Pricing
   */
  public function updatepricing(){

    // grab data from post
    $data = json_decode(file_get_contents('php://input'), true);

    // return if no data
    if(empty($data)){
      $this->response->setOutput(json_encode(array('error' => 'No post data')));
      return;
    }

    // get skus
    $skus = array_map(function($product){
      return $product['sku'];
    }, $data);

    // get skus ready for SQL
    $skuList = implode("','", $skus); // Join the SKUs with quotes

    // do the query
    $query = $this->db->query("
      SELECT p.image, p.price, p.product_id, p.quantity, p.sku
      FROM " . DB_PREFIX . "product p
      WHERE p.sku IN ('$skuList')
    ");

    // iterate over the results
    $products = array();
    if ($query->num_rows) {
      foreach ($query->rows as $product) {
        // find matching update
        $match = null; 
        foreach($data as $item){
          if($item['sku'] !== $product['sku']) continue;
          $match = $item;
          break;
        }
        if(!$match) continue;

        // check if needs updating
        $update = $match['update'];

        // update
        if($update){
          
          try{

            // setup query string
            $queryString = "
              UPDATE " . DB_PREFIX . "product
              SET cost = '" . (float)$match['cost'] . "', 
                  price = '" . (float)$match['price'] . "' 
              ";
            if(array_key_exists('quantity', $match)){
              $queryString.= "
                , 
                quantity = '" . (int)$match['quantity'] . "'
              ";
            }
            $queryString.= "
              WHERE sku = '" . $this->db->escape($product['sku']) . "'
            ";
            error_log($queryString);

            // DB call
            $dbUpdate = $this->db->query($queryString);

            if(!$dbUpdate){
              $product['updated'] = false;
              $product['updated_message'] = 'Could not update database';
            }
            // update product
            $product['updated'] = true;
          }

          catch(Exception $e){
            $product['updated'] = false;
            $product['updated_message'] = $e->getMessage();
          }

        }

        else{
          $product['updated'] = false;
          $product['updated_message'] = 'User chose not to update';
        }
        
        $products[] = $product;
      }
    }

    // return data
    $this->response->setOutput(json_encode(array('data' => $products)));
  }
  /**
   * The Vue App
   */
  public function loadApp(){
    ob_start();
    ?>
    
    <div id="app"><Upload /></div>

    <template id="soUpload">
      <div>
        <div v-show="step == 'csv'">
          <div class="step">
            <h3>1. Upload CSV</h3>
            <p>If the CSV file you choose doesn't load please import it to Google Sheets, then re-download it from there as a CSV. This will convert it to the correct format.</p>
            <label for="csv">Choose your file here:</label>
            <input @change="csvToArray" ref="csvInput" name="csv" type="file" accept=".csv" id="csv">
          </div>

          
          <div v-if="csvData && csvData.length" class="step">
            <h3>2. Select Fields</h3>
            <div v-for="(field, key) in csvFields" :key="key" class="input-wrapper">
              <label :for="`csvField_${key}`">{{field.label}}</label>
              <select v-model="field.value" id="`csvField_${key}`">
                <option value="" disabled selected>Select Field</option>
                <option v-if="key == 'soh'" value="none">N/A</option>
                <option v-for="(column, i) in csvData[0]" :key="column" :value="i">{{ column }}</option>
              </select>
            </div>
          </div>
          
        </div>
        <!--END CSV OPTIONS -->

        <div v-if="step == 'actions'">
          <div class="step">
            <h3>3. What are we doing today?</h3>
            <button v-if="this.csvFields.soh.value !== 'none'" @click="actionStock" class="btn btn-default">Updating Stock</button>
            <button @click="actionPricing" class="btn btn-default">Updating <span v-if="this.csvFields.soh.value !== 'none'">Stock & </span>Pricing</button>
          </div>

          <div v-if="update.type == 'stock'">
            <div class="step">
              <h4>Update Stock</h4>
              <p>Clicking the button below will search the database for all SKUs listed in the uploaded CSV, and update the stock if the product exists.</p>
              <p>Please note that suppliers may include SKUs in their CSVs which match products from other suppliers, but are actually different products.</p>
              <p>Are you sure you want to update?</p>
              <button @click="updateStock" :disabled="update.status !== ''" class="btn btn-primary">Update Now</button>
            </div>
            <div v-if="update.status !== ''" class="step">
              <h4>Updating Stock Now!</h4>
              <div v-if="update.status == 'loading'">
                <loading></loading> 
                <p>Batch {{ batch.page }} / {{ totalBatches }}</p>
              </div>
              <div v-if="update.status == 'finished'">
                <p><b>Update Finished!</b></p>
                <p><b>{{ csvData.length - 1 }}</b> SKUs checked</p>
                <p><b>{{ updateResponses.length || 0 }}</b> SKUs found</p>
                <p><b>{{ updateResponsesUpdated.length }}</b> SKUs updated</p>
                <p><b>{{ updateResponsesNotUpdated.length }}</b> SKUs not updated</p>
                <button @click="refresh" class="btn btn-primary">Start Again</button>
              </div>
            </div>
          </div>

          <div v-if="update.type == 'pricing'">

            <div v-if="update.status !== ''" class="step">
              <h4>Updating Stock & Pricing Now!</h4>
              <div v-if="update.status == 'loading'">
                <loading></loading>
                <p>Batch {{ batch.page }} / {{ totalBatches }}</p>
              </div>
              <div v-if="update.status == 'finished'">
                <p><b>Update Finished!</b></p>
                <p><b>{{ updateResponses.length || 0 }}</b> SKUs processed</p>
                <p><b>{{ updateResponsesUpdated.length }}</b> SKUs updated</p>
                <p><b>{{ updateResponsesNotUpdated.length }}</b> SKUs not updated</p>
                <button @click="refresh" class="btn btn-primary">Start Again</button>
              </div>
            </div>

            <div class="floating-actions">
              <button @click="toTop" class="btn btn-default">Back To Top</button>
              <button @click="updatePricing" :disabled="update.status !== ''" class="btn btn-primary">Update Now</button>
            </div>

            <div v-if="!update.status" class="step">
              <h4><span v-if="this.csvFields.soh.value !== 'none'">Stock & </span>Pricing Updates</h4>
              <label>Set your margin (%): <input type="number" v-model="pricing.margin" /></label>
              <p>Margins as set above (or better) will show as green.
                <br>Margins below the above, but still positive, will show as orange.
                <br>Negative margins will show as red.
              </p>
            </div>

            <loading v-if="!pricing.products.length"></loading>
            <div v-if="pricing.products.length && !update.status">

              <div>
                <button @click="filterPricingTable('all')" class="btn" :class="{'btn-primary': pricing.filter == 'all', 'btn-default': pricing.filter != 'all'}">All Products</button>
                <button @click="filterPricingTable('med')" class="btn" :class="{'btn-primary': pricing.filter == 'med', 'btn-default': pricing.filter != 'med'}">Medium Margins</button>
                <button @click="filterPricingTable('neg')" class="btn" :class="{'btn-primary': pricing.filter == 'neg', 'btn-default': pricing.filter != 'neg'}">Negative Margins</button>
              </div>

              <lazy-list
                v-if="showTable"
                :data="pricingFilteredProducts"
                :items-per-render="100"
              >
                <template v-slot="{item: product}">
                  <tr
                  :class="{
                    'margin-good': calculateMargin(product) >= this.pricing.margin,
                    'margin-med': calculateMargin(product) < this.pricing.margin && calculateMargin(product) > 0,
                    'margin-neg': calculateMargin(product) < 0,
                    'no-update': !product.update
                  }"
                  >
                    <td>
                      <img :src="product.image" :alt="product.name" class="img-thumbnail" loading="lazy">
                    </td>
                    <td><b>{{ product.name }}</b> <div><span class="sku">{{ product.sku }}</span><a :title="`Edit ${product.name}`" target="_blank" :href="`/admin/index.php?route=catalog/product/edit&product_id=${product.product_id}&user_token=${this.getUserTokenFromQueryString()}`">Edit →</a></div></td>
                    <td> {{ product.cost || product.cost_new }} </td>
                    <td> {{ product.cost_new }} <span v-html="showCostChange(product)"></span> </td>
                    <td> {{ calculateMargin(product) }}</td>
                    <td><input v-model="product.price" type="number" step="0.01" @change="editingProductRow(product)" @keyup="editingProductRow(product)" /></td>
                    <td style="text-align: center"><input v-model="product.update" type="checkbox" @change="editingProductRow(product)" @keyup="editingProductRow(product)" /></td>
                  </tr>
                </template>
              </lazy-list>

            </div>
          </div>
            
          </div>
        </div>
         <!--END ACTIONS -->
        <div v-if="error" style="margin-top: 2rem; color: red;">{{error}}</div>
        <nav style="margin-top: 5rem">
          <button class="btn btn-primary" v-if="step == 'csv' && csvFieldsSelected" @click="goTo('actions')">Next</button>
          <button class="btn btn-default" v-if="step != 'csv'" @click="goTo('csv')">Back to CSV Options</button>
        </nav>
      </div>
    </template>

    <!-- LAZYLIST -->
    <template id="lazyListTemplate">
      <div id="lazy-container" ref="container" :class="`${containerClasses}`" class="table-responsive">

      <table class="table table-bordered">
        <thead>
          <tr>
            <td>Image</td>
            <td>Name</td>
            <td>Current Cost Per Item</td>
            <td>New Cost Per Item</td>
            <td>New Margin (%)</td>
            <td>Price</td>
            <td>Update?</td>
          </tr>
        </thead>
        <tbody>
          <!-- items rendering -->
          <template
            v-for="(item) in itemsToDisplay"
          >
            <slot
              :item="item"
            ></slot>
          </template>
          <template v-if="loading">
            <!-- Loading component -->
            <tr v-if="defaultLoading" id="loading-wrapper">
                <loading :color="defaultLoadingColor" ></loading>
            </tr>
          </template>
          <tr v-if="!itemsToDisplay.length">
            <td colspan="7">
              No products found.
            </td>
          </tr>
        </tbody>
      </table>
      <div v-show="((page !== items.length - 1) || !loading)" id="end-of-list" ref="end-of-list"/>
      </div>
    </template>

    <template id="lazyListLoadingTemplate">
      <div class="dots">
        <div :style="`background-color: ${color}`"></div>
        <div :style="`background-color: ${color}`"></div>
        <div :style="`background-color: ${color}`"></div>
      </div>
    </template>

    <script type="module">
      import { createApp } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js'
      import { parse } from 'https://www.unpkg.com/@vanillaes/csv@3.0.1/index.min.js'
      
      const chunkArray = (arr, size) => Array.from({ length: Math.ceil(arr.length / size) }, 
      (v, i) => arr.slice(i * size, i * size + size))

      document.addEventListener("DOMContentLoaded", () => {
        console.log("Starting App");

        const app = createApp()

        const Loading = {
            template: document.getElementById('lazyListLoadingTemplate'),
            props:{
              color:{
                type: String,
                default: '#18191A',
              },
            }
        }

        const LazyList = {
          template: document.getElementById('lazyListTemplate'),
          components:{Loading},
          props:{
            data:{
              type: Array,
              default: () => [],
            },
            itemsPerRender:{
              type: Number,
              default: 3,
            },
            containerClasses:{
              type: String,
              default: '',
            },
            defaultLoading:{
              type: Boolean,
              default: true,
            },
            defaultLoadingColor:{
              type: String,
              default: '#18191A',
            },
          },
          created(){
            this.updateList();
            /*this.$watch('data', function () {
                this.updateList();
            }, {deep:true})*/
          },
          mounted(){
            document.addEventListener('scroll', this.loadItems)
            this.loadItems()
          },
          beforeUnmount(){
            document.removeEventListener('scroll', this.loadItems)
          },
          data(){
            return {
              items: [],
              page: 0, // page represents the index of last small array in the list
              loading: false,
              itemsToDisplay: [], // the list of items to be rendered
            }  
          },
          methods:{
            // set the list and update it when data changes
            updateList() {
              const chunckedArray = chunkArray(this.data,this.itemsPerRender) // chunkArray(data,itemsPerRender) to get array of small arrays
              this.items = chunckedArray
              //console.log(chunckedArray)
              this.itemsToDisplay =  chunckedArray[0] || []
            },
            
            // load more items when scrolling to the end of the list
            loadItems(){
              if(!this.items.length) return
              if(this.page === this.items.length - 1) return
              
              const element = this.$refs["end-of-list"] //this.endOfList;
              if(!element) return
              
              const position = element.getBoundingClientRect();

              // checking whether fully visible
              if((position.top >= 0 && position.bottom <= window.innerHeight  ) && !this.loading) {
                  this.loading = true
                  this.page++
                  setTimeout(() => {
                      this.itemsToDisplay = (this.page in this.items) ? [...this.itemsToDisplay, ...this.items[this.page]] : [...this.itemsToDisplay]
                      this.loading = false
                      this.loadItems()
                  }, 200);
              }
            },
          }
        }

        const Upload = {
          template: document.getElementById('soUpload'),
          components: { LazyList, Loading },
          data(){
            return {
              error: null,
              step: 'csv',
              csvData: null,
              csvFields: {
                sku: {
                  label: 'SKU Column:',
                  value: ''
                },
                soh: {
                  label: 'Quantity / Stock On Hand Column:',
                  value: ''
                },
                cost: {
                  label: 'Cost Per Item Column:',
                  value: ''
                }
              },
              update: {
                type: '',
                status: ''
              },
              updateResponses: [],
              batch: {
                numberToUpdate: 100,
                page: 1
              },
              pricing: {
                margin: 5,
                products: [],
                filter: 'all'
              },
              editing: {
                timeout: null,
                product: null
              },
              showTable: true
            }
          },
          computed:{
            updateResponsesUpdated(){
              return this.updateResponses.filter(product => {
                return product.updated
              })
            },
            updateResponsesNotUpdated(){
              return this.updateResponses.filter(product => {
                return !product.updated
              })
            },
            totalBatches(){
              if(this.update.type == 'stock'){
                return Math.ceil( (this.csvData.length - 1) / this.batch.numberToUpdate )
              }
              return Math.ceil( this.pricing.products.length / this.batch.numberToUpdate )
            },
            csvFieldsSelected(){
              let selected = true;
              for(const prop in this.csvFields){
                if (this.csvFields[prop].value === '') {
                  selected = false;
                  break;
                }
              }
              return selected
            },
            pricingFilteredProducts(){
              if(this.pricing.filter == 'all') return this.pricing.products

              if(this.pricing.filter == 'med'){
                return this.pricing.products.filter(product => {
                  if (
                    product.editing.status && product.editing.filter == this.pricing.filter
                  ) return true

                  if (
                    this.calculateMargin(product) < this.pricing.margin
                    && this.calculateMargin(product) > 0
                  ) return true

                  return false
                })
              }

              if(this.pricing.filter == 'neg'){
                return this.pricing.products.filter(product => {
                  if (
                    product.editing.status && product.editing.filter == this.pricing.filter
                  ) return true

                  if (this.calculateMargin(product) < 0) return true 
                  return false
                })
              }
              
            }
          },
          mounted(){
            // fetch(
            //       `${location.origin}/admin/index.php?route=extension/module/supplier_updates/hellothere&user_token=${this.getUserTokenFromQueryString()}`
            //     )
            //     .then(res => res.json())
            //     .then(data => {
            //       console.log('data', data)
            //     })
            //     .catch(error => console.error('data error', error))
          },
          methods: {
            getUserTokenFromQueryString() {
              var queryString = window.location.search;
              var urlParams = new URLSearchParams(queryString);
              var userToken = urlParams.get('user_token');
              return userToken;
            },
            async csvToArray(){
              this.csvData = null;
              this.error = null;

              // CSV parser
              // docs: https://github.com/vanillaes/csv
              try {
                let csvData = await new Promise((resolve, reject) => {
                  var reader = new FileReader();
                  reader.onload = function (e) {
                      var csv = reader.result
                      try {
                        var data = parse(csv)
                        resolve(data)
                      } catch (error) {
                        reject(error)
                      }
                      
                  }
                  reader.onerror = (error) => { 
                    reject(error)
                  }

                  reader.readAsBinaryString(this.$refs.csvInput.files[0]);
                });

                this.csvData = csvData 
              } catch (error) {
                this.error = error;
              }
              
            },
            goTo(step){
              this.step = step
              if(step == 'csv'){
                this.resetStuff()
              }
            },
            resetStuff(){
              this.update.type = ''
              this.update.status = ''
              this.updateResponses = []
              this.batch.page = 1
              this.pricing.products = []
              this.pricing.filter = 'all'
            },
            actionPricing(){
              
              // go to pricing page
              this.update.type = 'pricing'

              // grab the SKUs
              let skus = this.csvData.map(product => {
                let returnProduct = {
                  sku: product[this.csvFields.sku.value],
                  cost: product[this.csvFields.cost.value].trim().replace(/[^\d.-]/g, '')
                }
                if(this.csvFields.soh.value !== 'none'){
                  returnProduct['soh'] = product[this.csvFields.soh.value]
                }
                return returnProduct
              });

              // fetch all the products
              fetch(
                  `${location.origin}/admin/index.php?route=extension/module/supplier_updates/getProductsBySku&user_token=${this.getUserTokenFromQueryString()}`,{
                    method: 'POST',
                    body: JSON.stringify(skus)
                  }
                )
                .then(res => res.json())
                .then(data => {
                  this.pricing.products = data.data
                })
                .catch(error => console.error('error getting products', error))
            },
            async updatePricing(){
              this.update.status = 'loading'
              this.clearUpdateData()
              this.toTop()

              for (this.batch.page; this.batch.page <= this.totalBatches; this.batch.page++) {
                
                // USED FOR TESTING
                // if(this.batch.page > 1) continue;

                const start = (this.batch.page-1)*this.batch.numberToUpdate
                const end = (this.batch.page*this.batch.numberToUpdate) - 1
                let currentBatch = this.pricing.products.slice(start, end)

                currentBatch = currentBatch.map(product => {
                  let batchProduct = {
                    sku: product.sku,
                    cost: product.cost_new,
                    price: product.price,
                    update: product.update
                  }
                  if('quantity_new' in product){
                    batchProduct['quantity'] = product.quantity_new
                  }
                  return batchProduct
                })

                await fetch(
                  `${location.origin}/admin/index.php?route=extension/module/supplier_updates/updatepricing&user_token=${this.getUserTokenFromQueryString()}`,{
                    method: 'POST',
                    body: JSON.stringify(currentBatch)
                  }
                )
                .then(res => res.json())
                .then(data => {
                  console.log('batch returned '+this.batch.page, data)
                  this.updateResponses = this.updateResponses.concat(data.data)
                })
                .catch(error => console.error('batch error '+this.batch.page, error))
              }

              this.update.status = 'finished'
              this.batch.page = 1

            },
            actionStock(){
              this.update.type = 'stock'
            },
            async updateStock(){
              this.update.status = 'loading'

              this.clearUpdateData()

              for (this.batch.page; this.batch.page <= this.totalBatches; this.batch.page++) {
                const start = (this.batch.page-1)*this.batch.numberToUpdate || 1
                const end = (this.batch.page*this.batch.numberToUpdate) - 1
                let currentBatch = this.csvData.slice(start, end)

                currentBatch = currentBatch.map(product => {
                  return {
                    sku: product[this.csvFields.sku.value],
                    soh: product[this.csvFields.soh.value]
                  }
                })

                //console.log('sending batch '+this.batch.page, currentBatch)
                
                await fetch(
                  `${location.origin}/admin/index.php?route=extension/module/supplier_updates/updatestock&user_token=${this.getUserTokenFromQueryString()}`,{
                    method: 'POST',
                    body: JSON.stringify(currentBatch)
                  }
                )
                .then(res => res.json())
                .then(data => {
                  //console.log('batch returned '+this.batch.page, data)
                  this.updateResponses = this.updateResponses.concat(data.data)
                })
                .catch(error => console.error('batch error '+this.batch.page, error))

              }
              
              this.update.status = 'finished'
              this.batch.page = 1
              
            },
            clearUpdateData(){
              this.updateResponses = []
            },
            calculateMargin(product){
              let result = ( (product.price / product.cost_new) * 100 ) - 100
              return result.toFixed(2)
            },
            filterPricingTable(filter){
              this.showTable = false
              this.pricing.filter = filter
              setTimeout(()=>this.showTable = true, 50)
            },
            editingProductRow(product){
              //if(this.pricing.filter == 'all') return
              // clear timeout
              clearTimeout(this.editing.timeout)
              // reset product editing
              if(this.editing.product) this.editing.product.editing.status = false
              this.editing.product = product

              // set current eidting product status
              this.editing.product.editing.status = true
              
              // set current filter
              const margin = this.calculateMargin(this.editing.product)
              if(margin < this.pricing.margin && margin > 0){
                this.editing.product.editing.filter = 'med'
              }
              if(margin < 0){
                this.editing.product.editing.filter = 'neg'
              }

              // wait 1 second before filter updates take effect
              this.editing.timeout = setTimeout(()=>{
                this.editing.product.editing.status = false
              }, 5000)
            },
            toTop(){
              window.scroll({top: 0, left: 0, behavior: 'smooth'});
            },
            refresh(){
              location.reload()
            },
            showCostChange(product){
              if(!("cost_new" in product)){
                product['cost_new'] = '0.0000'
              }
              if(parseFloat(product.cost_new) > parseFloat(product.cost)){
                return '<span class="cost cost-increase">&uarr;</span>'
              }
              else if(parseFloat(product.cost_new) < parseFloat(product.cost)){
                return '<span class="cost cost-decrease">&darr;</span>'
              }
            }
          }
        }
        app.component('Loading', Loading)
        app.component('LazyList', LazyList)
        app.component('Upload', Upload)

        app.mount('#app')
      });
    </script>

    <style>
      .img-thumbnail {
          width: 40px;
          height: 40px;
          object-fit: cover;
      }
      thead{
          background-color: #fff
      } 
      tr.margin-good {
          color: #357a35;
          background-color: #f0fff0;
      }
      tr.margin-med {
          color: #7d4a00;
          background-color: #f7ecdc;
      }
      tr.margin-neg {
          color: #830e00;
          background-color: #ffeae8;
      }
      tr.no-update {
          text-decoration: line-through;
          opacity: 0.3
      }
      td .sku {
          background-color: rgb(0 0 0 / 10%);
          padding: 1px 5px;
          margin: 2px 5px 2px 0;
          border-radius: 5px;
      }
      td div {
          margin-top: 5px;
      }

      .floating-actions{
        position: fixed;
        bottom: 1rem;
        right: 1rem;
        z-index: 99;
      }
      #app .step {
        margin-bottom: 3rem;
      }

      #app .input-wrapper{
          margin-bottom: 5px;
      }
      #app .input-wrapper label{
          margin-right: 10px
      }

      #app .btn{
          margin: 5px 5px 5px 0;
      }

      span.cost {
          display:inline-flex;
          border-radius: 3px;
          width: 13px;
          height: 13px;
          text-align: center;
          font-size: 10px;
          align-items: center;
          justify-content: center;
      }
      span.cost.cost-decrease{
          background-color: #357a35;
          color: #f0fff0;
      }
      span.cost.cost-increase{
          background-color: #830e00;
          color: #ffeae8;
      }

      /* LAZY LIST */
      .hidden{
          display: none;
      }

      /* List container style */
      #lazy-container{
          width: 100%;
          height: 100%;
          overflow-y: auto;
          overflow-x: hidden;
          scroll-behavior: smooth;
          scrollbar-width: thin;
      }
      #end-of-list{
          height: 32px;
          width: 100%;
      }
      #loading-wrapper{
          width: 100%;
          height: 32px;
          display: flex;
          justify-content: center;
          align-items: center;
      }

      /* Loading style */
      .dots {
          width: 3.5em;
          display: flex;
          flex-flow: row nowrap;
          align-items: center;
          justify-content: space-between;
      }
      .dots div {
          width: 0.8em;
          height: 0.8em;
          border-radius: 50%;
          animation: fade 0.8s ease-in-out alternate infinite;
      }
      .dots div:nth-of-type(1) {
          animation-delay: -0.4s;
      }
      .dots div:nth-of-type(2) {
          animation-delay: -0.2s;
      }
      @keyframes fade {
          from {
              opacity: 1;
          }
          to {
              opacity: 0;
          }
      }
      @media(max-width: 480px) {
          .dots div {
              width: 0.7em;
              height: 0.7em;
          }
      }
    </style>
    <?php
    
    $content = ob_get_clean();
    return $content;
  }
}