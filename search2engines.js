angular.module('coding_test', ['ui.bootstrap'])
    .controller('s2e', function ($scope, $q, $http) {

        const SIMILARITY_THRESHOLD = 0.8; // arbitrary value, to be tweaked by testing
        const MAX_RESULTS_PER_ENGINE = 50; // arbitrary value

        // API keys
        // Bing
        const BING_API_KEY = '3cdf3622904a45edaf3c994e492d57b9'; // S2 Tier
        const BING_CUSTOM_ENGINE_ID = 'a74e4483-dd8f-4f1f-922c-d22d1ebbd60a'; // Vanilla-flavoured instance = nothing blocked/filtered, nothing pinned
        // Google
        const GOOGLE_API_KEY = 'AIzaSyCLRmxBxFyABgKGbC-7cEO6JiWcgNHZsYc'; // Paid tier with 10k querries/day limit
        const GOOGLE_CUSTOM_ENGINE_ID = '002501037099736245903:klbrenxvcxk'; // The custom engine's scope is set to whole web. Not possible with all the tiers, but works with mine 
        // Contextual Web (via RapidAPI)
        const RAPID_API_KEY = 'ea2f6f7025msh4b16fac044108dcp12a222jsn322d0a3adc94'; // Free tier with 10k querries/month

        // Will store our URI encoded search term here
        // Apologies for the const-like name convention, but it makes it easier to read the URL later
        var SEARCH_TERM_URI;

        // Array with available search engines, with their default states
        $scope.availableEngines = [
            {
                name: 'Google',
                selected: true,
                disabled: false
            },
            {
                name: 'Bing',
                selected: true,
                disabled: false

            },
            {
                name: 'Contextual Web',
                selected: false,
                disabled: true
            }
        ];

        // set up some variables used in pagination
        $scope.totalItems = 0;
        $scope.currentPage = 1;
        $scope.itemsPerPage = 10;

        // will use {} so its easier to merge results at later stage
        // while tempting to use [] where results remain ranked, they would have to be re-ranked once merged
        var googleResults = {};
        var bingResults = {};
        var contextualWebResults = {};

        // will store ready-to-display results here
        $scope.rankedSearchResults = [];

        // A flag, so the VIEW knows what's happening
        $scope.searching = false;

        // Searches google
        // Obtains upto MAX_RESULTS_PER_ENGINE (50) results be iterating a 10-result API call
        function searchGoogle() {
            var deferred = $q.defer();

            // Need to keep track of the number of responses that came back
            // so I know when to resolve
            var responseCount = 0;

            // Iterating the API call in order to get more than 10 results
            for (var i = 1; i < MAX_RESULTS_PER_ENGINE; i += 10) {
                $.ajax({
                    method: 'GET',
                    dataType: 'jsonp',
                    url: 'https://www.googleapis.com/customsearch/v1?key=' + GOOGLE_API_KEY + '&cx=' + GOOGLE_CUSTOM_ENGINE_ID + '&q=' + SEARCH_TERM_URI + '&start=' + i,

                    success: (res) => {
                        if (res.items != undefined) {
                            // some processing to match desired schema
                            res.items.forEach(function (search_result) {
                                currentResult = {
                                    "title": search_result.title,
                                    "url": search_result.link,
                                    "snippet": search_result.snippet,
                                    "sourceEngine": "google", // Attribute not currently used
                                }
                                googleResults[currentResult['url']] = currentResult;
                            });
                        } else {
                            console.log('got empty response from google');
                        }

                        responseCount++;

                        // all expected responses came back, resolve it
                        if (responseCount == MAX_RESULTS_PER_ENGINE / 10) {
                            deferred.resolve('google');
                        }
                    },
                    failure: (err) => {
                        console.log('google error');
                    }
                });
            };

            return deferred.promise;
        }

        // Searches Bing
        function searchBing() {
            var deferred = $q.defer();

            $.ajax({
                method: 'GET',
                headers: {
                    'Ocp-Apim-Subscription-Key': BING_API_KEY,
                },
                url: 'https://api.cognitive.microsoft.com/bingcustomsearch/v7.0/search?q=' + SEARCH_TERM_URI + '&customconfig=' + BING_CUSTOM_ENGINE_ID + '&safeSearch=Off&mkt=en-GB&count=' + MAX_RESULTS_PER_ENGINE, //Please note assumptions like safeSearch=Off, mkt=en-GB

                success: (res) => {
                    if (res.webPages != undefined) {
                        // some processing to match desired schema
                        res.webPages.value.forEach(function (search_result) {
                            currentResult = {
                                "title": search_result.name,
                                "url": search_result.url,
                                "snippet": search_result.snippet,
                                "sourceEngine": "bing", // Attribute not currently used
                            }

                            bingResults[currentResult['url']] = currentResult;
                        });
                    }

                    deferred.resolve('bing');
                },
                failure: (err) => {
                    console.log('bing error');
                }
            });

            return deferred.promise;
        }

        // Search Contextual Web
        // Included despite low accuracy of the results - there are better API's out there, but generally not free 
        function searchContextualWeb() {
            var deferred = $q.defer();

            $.ajax({
                method: 'GET',
                dataType: 'json',
                headers: {
                    'X-RapidAPI-Host': 'contextualwebsearch-websearch-v1.p.rapidapi.com',
                    'X-RapidAPI-Key': RAPID_API_KEY
                },
                url: 'https://contextualwebsearch-websearch-v1.p.rapidapi.com/api/Search/WebSearchAPI?autoCorrect=true&pageNumber=1&pageSize=' + MAX_RESULTS_PER_ENGINE + '&q=' + SEARCH_TERM_URI + '&safeSearch=false', // Please note assumptions like autoCorrect=true and safeSearch=false

                success: (res) => {
                    if (res.value != undefined) {
                        // some processing to match desired schema
                        res.value.forEach(function (search_result) {
                            currentResult = {
                                "title": search_result.title,
                                "url": search_result.url,
                                "snippet": search_result.description,
                                "sourceEngine": "contextualWeb", // Attribute not currently used
                            }

                            contextualWebResults[currentResult['url']] = currentResult;
                        })
                    }
                    deferred.resolve('ContextualWeb');
                },
                failure: (err) => {
                    console.log('CW error');
                }
            })

            return deferred.promise;
        }

        // Returns the state of 'Search' button based on state of search query input
        // and search engine checkboxes
        // false => disabled button
        $scope.getButtonState = function () {
            if ($scope.searchTerm == undefined) {
                return false;
            } else if ($scope.searchTerm.length < 1 || $scope.numSelected == 0) {
                return false;
            }

            return true;
        }

        // Main function that is called from the VIEW
        // Makes individual searches asynchronously, mergers and ranks the results
        $scope.search = function () {
            reset();
            $scope.searching = true;

            // encode raw search term as URI
            SEARCH_TERM_URI = encodeURIComponent($scope.searchTerm);

            // Populating the array based on selected search engines
            // Not the cleverest solution, but needed something that can be dynamicaly built
            // and could be iterated over by the $q.all()
            var searchesToExecute = [$scope.availableEngines[0].selected ? searchGoogle() : null,
                            $scope.availableEngines[1].selected ? searchBing() : null,
                            $scope.availableEngines[2].selected ? searchContextualWeb() : null];

            $q.all(searchesToExecute).then(
                function (successResult) {
                    // Merge, removing duplicates
                    // No need to worry about which search engines were used, merge nevertheless 
                    var mergedResults = Object.assign({}, googleResults, bingResults, contextualWebResults);

                    // Rank the combined results
                    $scope.rankedSearchResults = rank(mergedResults);

                    // Check if we got any results left
                    if ($scope.rankedSearchResults.length > 0) {
                        $scope.totalItems = $scope.rankedSearchResults.length;
                    } else {
                        $scope.noResults = true;

                        // copying the original search term so it can be displayed in error message
                        // to avoid the error message updating while user interact with the search box
                        $scope.failedSearchTerm = $scope.searchTerm;
                    }

                    $scope.searching = false;
                },
                function (failureReason) {
                    console.log('ERROR');
                    $scope.searching = false;
                }
            );
        }

        // Returns the ranked results
        // admitedly, the ranking based on title and snippet only is less-than-optimal
        // morover, the results that were originally returned by engines, might be purged at this stage
        // not necesarily a bad thing, since only the poorest results get the axe
        // Long story short, there's infinite room for improvement here, but the solution below should suffice for the coding test
        function rank(results) {
            // set up elacsticlunr's index
            var index = elasticlunr(function () {
                this.setRef('url');
                this.addField('title');
                this.addField('snippet');
            });

            // add results to elasticlunr's index
            for (var r in results) {
                index.addDoc(results[r]);
            }

            var rankedResults = index.search($scope.searchTerm, {
                fields: {
                    title: {
                        boost: 5
                    },
                    snippet: {
                        boost: 1
                    }
                }
            });

            return rankedResults;
        }

        // Please note that url is being opened in new window so the search is not unnecessarily repeated
        // in order to preserve low quotas on API calls
        // Also, 'visited' timestamp (in current implementation) will not persist between searches
        // I could save it (cookie?), but the current solution was deemed enough for the coding test
        $scope.openInNewWindow = function (result) {
            result['visited'] = new Date();

            window.open(result.url);
        }

        //  Returns similarity of two strings, in the range [0..1], where 1 indicates exact match
        //  https://stackoverflow.com/questions/10473745/compare-strings-javascript-return-of-likely/36566052, by overlord1234
        function similarity(s1, s2) {
            var longer = s1;
            var shorter = s2;

            // ensure that the strings are ordered by their lenght
            if (s1.length < s2.length) {
                longer = s2;
                shorter = s1;
            }

            var longerLength = longer.length;

            if (longerLength == 0) {
                return 1.0;
            }

            return (longerLength - editDistance(longer, shorter)) / parseFloat(longerLength);
        }

        //  A worker function used by similarity() function above
        //  https://stackoverflow.com/questions/10473745/compare-strings-javascript-return-of-likely/36566052, by overlord1234
        function editDistance(s1, s2) {
            s1 = s1.toLowerCase();
            s2 = s2.toLowerCase();

            var costs = new Array();
            for (var i = 0; i <= s1.length; i++) {
                var lastValue = i;
                for (var j = 0; j <= s2.length; j++) {
                    if (i == 0)
                        costs[j] = j;
                    else {
                        if (j > 0) {
                            var newValue = costs[j - 1];
                            if (s1.charAt(i - 1) != s2.charAt(j - 1))
                                newValue = Math.min(Math.min(newValue, lastValue),
                                    costs[j]) + 1;
                            costs[j - 1] = lastValue;
                            lastValue = newValue;
                        }
                    }
                }
                if (i > 0)
                    costs[s2.length] = lastValue;
            }
            return costs[s2.length];
        }

        // Updates the number of results displayed per page
        $scope.setItemsPerPage = function (num) {
            $scope.itemsPerPage = num;

            // display 1st page
            $scope.currentPage = 1;
        }

        // Handles the disabled/enabled state of the search engines
        $scope.updateEngineStates = function () {
            //count currently selected engines
            $scope.numSelected = $scope.availableEngines.filter(function (engine) {
                return engine.selected
            }).length;

            // if two engines are already selected, block the third one
            // admitedly for no good reason other than the acceptance criteria requiring 2 engines
            if ($scope.numSelected > 1) {
                $scope.availableEngines.forEach(function (engine) {
                    engine.disabled = !engine.selected;
                });
            } else {
                // Unlock all engines
                $scope.availableEngines.forEach(function (engine) {
                    engine.disabled = false;
                })
            }
        }

        // Resets variables and objects ready for a new search
        function reset() {
            googleResults = {};
            bingResults = {};
            contextualWebResults = {};
            $scope.rankedSearchResults = [];
            $scope.noResults = false;
            $scope.totalItems = 0;
            $scope.currentPage = 1;
        }
    });
