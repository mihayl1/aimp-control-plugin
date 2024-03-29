/*
    Script contains functions for AIMP Control plugin frontend to communicate with AIMP RPC(Xmlrpc/Jsonrpc) server.
    Copyright (c) 2014, Alexey Ivanov
*/

// Global data
var $playlists_tabs = null;
var $playlists_tables = {}; // maps entries table id to datatable object.
var aimp_manager = new AimpManager();
var control_panel_state = {};
var control_menu_state_updaters = {}; // map unique ID of context menu to notifier descriptor(object with following members: notifier - function (entry_control_menu_descriptor), control_menu_descriptor - control menu descritor).
var track_progress_timer = null;
var entries_requests = {}; // contains latest entry list requests to server for each playlist. Need for automatic displaying current track in playlist.
var need_goto_current_track_once_on_playlist_content_load = true;

var icon_menu_indicator_opened = 'ui-icon-minus',
    icon_menu_indicator_closed = 'ui-icon-plus';

/* Invoke notifiers for all control menus. */
function syncronizeControlMenus() {
    for (key in control_menu_state_updaters) {
        var notifier_desc = control_menu_state_updaters[key];
        notifier_desc.notifier(notifier_desc.control_menu_descriptor);
    }
}

function getPlaylistTableID(playlist_id)
{
    return 'entries_table_' + playlist_id;
}

function getPlaylistDataTable(playlist_id) {
    return $playlists_tables[getPlaylistTableID(playlist_id)];
}

function removeHighlightFromAllRows($table) {
    $($table.fnSettings().aoData).each(
        function () {
            $(this.nTr).removeClass('row_selected');
        }
    );
}

function highlightCurrentRow($table, nRow) {
    // remove highlight from all tables
    for (table_id in $playlists_tables) {
        removeHighlightFromAllRows($playlists_tables[table_id]);
    }
    //removeHighlightFromAllRows($table);
    $(nRow).addClass('row_selected');           
}

function getPlaylistIdFromTabId(tab_id) {
    return tab_id.split('_')[1];
}

function getPlaylistIdFromTableId(table_id)
{
    return table_id.split('_')[2]; // get id of playlist HTML table.(Ex.: id = 123 from string like this "entries_table_123" )
}

/* create DataTable control(jQuery plugin) for list of entries. */
function createEntriesControl(playlist_id)
{
    if (playlist_id == 0) {
        return;
    }
    
    var $table_with_playlist_id = $('#entries_table_' + playlist_id);

    var $table;

    // Return track desc which linked with string.
    function getDescriptionTrackOfRow(nTr) {
        var playlist_id = getPlaylistIdFromTableId(nTr.parentNode.parentNode.id);
        var row_index = $table.fnGetPosition(nTr);
        if (row_index !== null) {
            var aData = $table.fnGetData(row_index);
            var track_id = aData[0];
            return { playlist_id : parseInt(playlist_id),
                     track_id    : parseInt(track_id)
                   };   
        }
        return null;
    }

    /* Add a click handler to the rows - this could be used as a callback */
    $('#entries_table_' + playlist_id + ' tbody').click(
        function(event) {
            // need to filter out invalid type and non track rows(context menu rows)
            if (   event.target.parentNode !== null
                && event.target.parentNode.nodeName === 'TR'
                && $table.fnSettings().aoData.length > 0
                )
            {
                highlightCurrentRow($table, event.target.parentNode);
                var track_desc = getDescriptionTrackOfRow(event.target.parentNode);
                if (track_desc !== null) {
                    if (   track_desc.track_id !== control_panel_state.track_id
                        || track_desc.playlist_id !== control_panel_state.playlist_id
                        )
                    {
                        aimp_manager.play(track_desc,
                                          { on_exception : function(error, localized_message) {
                                                               alert(localized_message);
                                                           }
                                          }); // start playback.
                    }
                }   
            }
        }
    );

    $table = $table_with_playlist_id.dataTable( {
        ///!!! bDestroy : true, 
        bStateSave : true, // save state in cookies.
        aoColumns : getDataTablesColumnsDescriptors(),
        fnDrawCallback : onPlaylistTableDraw,
        oLanguage : {
            sUrl : getLocalizationDirectory() + '/datatables.txt'
        },
        bServerSide : true,
        sAjaxSource : '', // not used. Instead get data with aimp_manager.getPlaylistEntries() method.
        fnServerData : function (sSource, aoData, fnCallback) {
            // implementation idea is here: http://datatables.net/examples/server_side/pipeline.html

            var on_error = function (error, localized_error_message) {
                var msg = getText('error_playlist_entries_loading')+ ' ' + getText('reason') + ': ' + localized_error_message;
                alert(msg);
            };

            function fnGetKey(aoData, sKey) {
                for (var i = 0, iLen = aoData.length; i < iLen; ++i) {
                    if (aoData[i].name == sKey) {
                        return aoData[i].value;
                    }
                }
                return null;
            }

            var sEcho = fnGetKey(aoData, 'sEcho'); // get value here since it can change when on_success() will be invoked.

            var on_success = function(fnCallback) {
                return function(result) {
                    if (undefined === $playlists_tables[getPlaylistTableID(playlist_id)]) {
                        // this means that playlist table was destroyed before we get content.
                        return;
                    }
                    
                    // call DataTables function - data getter.
                    fnCallback({
                                sEcho : sEcho,
                                iTotalRecords : result.total_entries_count,
                                iTotalDisplayRecords : (result.count_of_found_entries !== undefined) ? result.count_of_found_entries : result.total_entries_count,
                                aaData : result.entries
                    });
                    
                    var force_page_and_playlist_switch = false;
                    if (need_goto_current_track_once_on_playlist_content_load) {
                        force_page_and_playlist_switch = true;
                        need_goto_current_track_once_on_playlist_content_load = false;
                    }
                    gotoCurrentTrackInPlaylist(force_page_and_playlist_switch);
                };
            }

            var fields = fnGetKey(aoData, 'sColumns').split(',');
            /* Sort descriptors */
            var order_fields = [];
            var iSortingCols = fnGetKey(aoData, 'iSortingCols');
            for (var i = 0; i < iSortingCols; ++i) {
                var iSortColCurrent = fnGetKey(aoData, 'iSortCol_' + i);
                if ( fnGetKey(aoData, 'bSortable_' + iSortColCurrent) === true) {
                    order_fields.push({
                        field : fields[iSortColCurrent],
                        dir :  fnGetKey(aoData, 'sSortDir_' + i)
                    });
                }
            }

            var request_params = {  playlist_id   : parseInt(playlist_id),
                                    fields        : fields,
                                    order_fields  : order_fields,
                                    start_index   : fnGetKey(aoData, 'iDisplayStart'),
                                    entries_count : fnGetKey(aoData, 'iDisplayLength'),
                                    search_string : fnGetKey(aoData, 'sSearch')
                                 };
            entries_requests[request_params.playlist_id] = request_params;
            aimp_manager.getPlaylistEntries(request_params,
                                            {
                                              on_success   : on_success(fnCallback),
                                              on_exception : on_error,
                                              on_complete  : undefined
                                            }
            );
        },
        bProcessing : true,
        bJQueryUI : true,
        sPaginationType : 'full_numbers',
        bAutoWidth : false,
        aLengthMenu : [10, 25, 50, 100, 1000] // [[10, 25, 50, -1], [10, 25, 50, getText('all_entries')]]
    } );
    
    $table.fnSettings().aaSorting = []; // disable sorting by 0 column.
    
    $playlists_tables[getPlaylistTableID(playlist_id)] = $table;
    
    need_goto_current_track_once_on_playlist_content_load = control_panel_state.hasOwnProperty('playlist_id') ? playlist_id == control_panel_state.playlist_id
                                                                                                              : true;
}

function gotoCurrentTrackInPlaylist(force_page_and_playlist_switch_local)
{
    // clear highlighting if player is stopped.
    if (control_panel_state.playback_state == 'stopped') {
        for (var i in $playlists_tables) {
            removeHighlightFromAllRows($playlists_tables[i]);    
        }
        return;
    }
    
    // check if playlist content is loaded and load it if it does not.
    if (control_panel_state.hasOwnProperty('playlist_id')) {
        if ($playlists_tabs != null) {
            loadPlaylistContentIfNotLoadedYet(control_panel_state.playlist_id);
        }
    }
    
    if (entries_requests.hasOwnProperty(control_panel_state.playlist_id) ) {
        var request_params = entries_requests[control_panel_state.playlist_id]; // maybe we need copy this
        request_params['track_id'] = control_panel_state.track_id;
        aimp_manager.getEntryPositionInDatatable(request_params,
                                             { on_success   : function (result) {
                                                                  if (result.page_number >= 0 && result.track_index_on_page >= 0) {
                                                                      if (force_page_and_playlist_switch_local) {
                                                                          gotoCurrentPlaylist(control_panel_state.playlist_id);
                                                                          tryToLocateCurrentTrackInPlaylist(result.page_number, result.track_index_on_page);
                                                                      } else {
                                                                          tryToLocateCurrentTrackInPlaylistOnCurrentPageOnly(result.page_number, result.track_index_on_page);
                                                                      }
                                                                  } else {
                                                                      //if ( control_panel_state.hasOwnProperty('playlist_id') ) {
                                                                      removeHighlightFromAllRows( getPlaylistDataTable(control_panel_state.playlist_id) );
                                                                      //}
                                                                  }
                                                              },
                                               on_exception : function(error, localized_message) {
                                                                  //alert(localized_message);
                                                                  //if ( control_panel_state.hasOwnProperty('playlist_id') ) {
                                                                  removeHighlightFromAllRows( getPlaylistDataTable(control_panel_state.playlist_id) );
                                                                  //}
                                                              },
                                               on_complete  : undefined
                                             }
                                             );
    }
}

function gotoCurrentPlaylist(playlist_id)
{
    $('div[id*=playlist]', $playlists_tabs).each(function(index, tab_ui) {
        var tab_playlist_id = getPlaylistIdFromTabId(tab_ui.id);
        if (playlist_id == tab_playlist_id) {
            $playlists_tabs.tabs('option', 'active', index);
            //$playlists_tabs.tabs('select', index);
            return false;
        }
        return true;
    });
}

function tryToLocateCurrentTrackInPlaylistOnCurrentPageOnly(entry_page_number, entry_index_on_page)
{
    var $playlist_table = getPlaylistDataTable(control_panel_state.playlist_id);
    if ($playlist_table === undefined) {
        return;
    }
    var oSettings = $playlist_table.fnSettings();
    
    var index_of_first_entry_on_page = entry_page_number * oSettings._iDisplayLength;
    if (oSettings._iDisplayStart == index_of_first_entry_on_page) {
        // highlight current track.
        var dt_row = $(oSettings.aoData).get(entry_index_on_page);
        var nRow = dt_row.nTr;
        highlightCurrentRow($playlist_table, nRow);
    }
}

function tryToLocateCurrentTrackInPlaylist(entry_page_number, entry_index_on_page)
{
    var $playlist_table = getPlaylistDataTable(control_panel_state.playlist_id);
    if ($playlist_table === undefined) {
        return;
    }
    var oSettings = $playlist_table.fnSettings();
    var index_of_first_entry_on_page = entry_page_number * oSettings._iDisplayLength;
    if (oSettings._iDisplayStart != index_of_first_entry_on_page) {
        // move to page where current track is visible.
        oSettings._iDisplayStart = index_of_first_entry_on_page;
        oSettings._iDisplayEnd = oSettings._iDisplayStart + oSettings._iDisplayLength;
        $playlist_table.entry_index_on_page_to_highlight_on_update = entry_index_on_page;
        $playlist_table.fnDraw(false);
    } else {
        // highlight current track.
        var dt_row = $(oSettings.aoData).get(entry_index_on_page);
        if (dt_row !== undefined) { // data have been loaded.
            var nRow = dt_row.nTr;
            highlightCurrentRow($playlist_table, nRow);
        }
    }
}

function getTrackForRatingSetTable(node) {
    var rating_div = node.parentNode;
    var parts = rating_div.id.split('_');

    var playlist_id = parseInt(parts[2]);
    var track_id    = parseInt(parts[3]);
    return { 'playlist_id': playlist_id,
         'track_id': track_id
       };
}   

function onPlaylistTableDraw(oSettings) {
    addControlMenuToEachEntry(oSettings);
    
    var $table = getPlaylistDataTable( getPlaylistIdFromTableId(oSettings.nTable.id) );
    
    if ( $table.hasOwnProperty('entry_index_on_page_to_highlight_on_update') ) {
        highlightCurrentRow($table,
                            $table.fnGetNodes($table.entry_index_on_page_to_highlight_on_update)
                            );
        delete $table.entry_index_on_page_to_highlight_on_update;
    }
    
    // init all rating widgets in table
    $('div[id^="track_rating_"]', $table).each(function(index, rating_div) {
        initStarRatingWidget(rating_div.id, getTrackForRatingSetTable);
    });
}

/* Add control menu switcher and menu itself to all entries. */
function addControlMenuToEachEntry(oSettings)
{
    if (oSettings.aoData.length > 0) { // add control to entry if we have some data. DataTables add string "Nothing found" if there is no data.
        var oTable = $('#' + oSettings.sTableId);
        var $table = $playlists_tables[oSettings.sTableId];

        if ( $('#playcontrol', oTable).length == 0) {
            /*
             Insert a 'entry control menu' column to the table
            */
            var nCloneTh = document.createElement('th');
            nCloneTh.id = 'playcontrol';
            var head_rows = $('thead tr', oTable);
            head_rows.each( function () {
                // insert new column
                added_node = this.insertBefore(nCloneTh.cloneNode(true), this.childNodes[0]);
                // set class of new column equal class of neighbour column. At least one column must exist('title' column is always visible).
                added_node.className = this.childNodes[1].className;
                $(added_node).css('width', '1px'); // set minimal width of column, browser will use content width.
            });
        }

        var nCloneTd = document.createElement('td'); // $('<button class="entry_control_menu_toggle"></button>')
        nCloneTd.innerHTML = '<button class="entry_control_menu_toggle"></button>';
        //nCloneTd.className = "center";

        $('tbody tr', oTable).each( function () {
            this.insertBefore(nCloneTd.cloneNode(true), this.childNodes[0]);
        });

        /*
            Add event listener for opening and closing entry control menu.
            Note that the indicator for showing which row is open is not controlled by DataTables,
            rather it is done here
        */
        $('td .entry_control_menu_toggle', $table.fnGetNodes() ).each( function () {
            $(this).button({
                text: false,
                icons: {
                    primary: icon_menu_indicator_closed
                },
                label: getText('track_contol_menu_open')
            }).click(onContextMenuButtonClick);
        });   
    }
}

function getControlMenuDescriptor(nTr)
{
    var playlist_id = getPlaylistIdFromTableId(nTr.parentNode.parentNode.id);
    var $table = getPlaylistDataTable(playlist_id);
    var aData = $table.fnGetData(nTr);
    var entry_id = aData[0];

    var play_button_id          = 'play_entry_' + entry_id;
    var enqueue_entry_button_id = 'enqueue_entry_' + entry_id;
    var remove_from_queue_entry_button_id = 'remove_from_queue_entry_' + entry_id;
    var download_track_button_id = 'download_track_entry_' + entry_id;
    var control_menu_html = '<button id="' + play_button_id + '"></button>'
                            + '<button id="' + enqueue_entry_button_id + '"></button>'
                            + '<button id="' + remove_from_queue_entry_button_id + '"></button>'
                            + '<button id="' + download_track_button_id + '"></button>'
                            ;

    return {
        html : control_menu_html,
        entry_id : entry_id,
        playlist_id : playlist_id,
        nTr : null,
        play_button_id : play_button_id,
        enqueue_button_id : enqueue_entry_button_id,
        remove_from_queue_button_id : remove_from_queue_entry_button_id,
        download_track_button_id : download_track_button_id
    };
}

function onContextMenuButtonClick() {
    var nTr = this.parentNode.parentNode;
    var entry_control_menu_descriptor = getControlMenuDescriptor(nTr);
    
    var playlist_id = getPlaylistIdFromTableId(nTr.parentNode.parentNode.id);
    var $table = getPlaylistDataTable(playlist_id);
    
    if ( $(this).button('option', 'icons').primary == icon_menu_indicator_opened ) {
        // remove menu updater from global list.
        var notifier_id = entry_control_menu_descriptor.entry_id + '_' + entry_control_menu_descriptor.playlist_id;
        delete control_menu_state_updaters[notifier_id]; // entry_control_menu_descriptor was initialized on menu open.

        /* Control menu for this entry is already open - close it */
        $(this).button('option', {
                                   icons: { primary: icon_menu_indicator_closed },
                                   label: getText('track_contol_menu_open')
                                 }
        );
        $(entry_control_menu_descriptor.nTr).removeClass('control_menu');
        $table.fnClose(nTr);
    } else {
        /* Open control menu for this entry */
        $(this).button('option', {
                                   icons: { primary: icon_menu_indicator_opened },
                                   label: getText('track_contol_menu_close')
                                 }
        );
        entry_control_menu_descriptor.nTr = $table.fnOpen(nTr, entry_control_menu_descriptor.html, 'entry_control_menu');
        $nTr = $(entry_control_menu_descriptor.nTr);
        $nTr.addClass('control_menu');
        // use internal details of fnOpen to set colspan member to right value: fix vertical alignment of context menu when only one field of track is visible.
        var cols_count_total = $table[0].rows[0].cells.length;
        $nTr[0].children[0].colSpan = cols_count_total;
        
        initTrackControlMenu(entry_control_menu_descriptor);
        updateTrackControlMenu(entry_control_menu_descriptor);
    }
}

/* Returns true if playback is active now. */
function isPlaybackActive() {
    return control_panel_state.playback_state == 'playing';
}

/*
    Returns true if track in control_menu_descriptor is current track in AIMP.
    Notice, it may not be played currently, use isCurrentTrackPlaying() instead if needed.
*/
function isCurrentTrackActive(control_menu_descriptor) {
    return control_panel_state.playlist_id == control_menu_descriptor.playlist_id
           && control_panel_state.track_id == control_menu_descriptor.entry_id
    ;
}

/* Returns true if track in control_menu_descriptor is played now. */
function isCurrentTrackPlaying(control_menu_descriptor) {
    return isPlaybackActive()
           && isCurrentTrackActive(control_menu_descriptor)
    ;
}

/* Init controls of created entry menu. */
function initTrackControlMenu(control_menu_descriptor)
{
    var on_control_menu_command = function(error, localized_message) {
        alert(localized_message);
    };

    var play_button = $('#' + control_menu_descriptor.play_button_id, control_menu_descriptor.nTr);
    play_button.button({
        text : false
    }).click(function() {
        if ( !isCurrentTrackPlaying(control_menu_descriptor) ) {
            // if current track is active proceed playing, do not start track from beginning.
            var play_args = isCurrentTrackActive(control_menu_descriptor)
                            ? {}
                            : { track_id    : parseInt(control_menu_descriptor.entry_id),
                                playlist_id : parseInt(control_menu_descriptor.playlist_id)
                              }
            ;
            aimp_manager.play(play_args,
                              { on_exception : on_control_menu_command }
                              ); // start playback.
        } else {
            aimp_manager.pause({}, { on_exception : on_control_menu_command }); // pause playback
        }
    });

    var enqueue_button = $('#' + control_menu_descriptor.enqueue_button_id, control_menu_descriptor.nTr);
    enqueue_button.button({
        text : false,
        icons: { primary: 'ui-icon-circlesmall-plus' },
        label : getText('track_contol_menu_enqueue')        
    }).click(function() {
        var args = { track_id    : parseInt(control_menu_descriptor.entry_id),
                     playlist_id : parseInt(control_menu_descriptor.playlist_id)
                   }
        aimp_manager.enqueueTrack(args,
                                  { on_exception : on_control_menu_command }
                                  );
    });

    var remove_from_queue_button = $('#' + control_menu_descriptor.remove_from_queue_button_id , control_menu_descriptor.nTr);
    remove_from_queue_button.button({
        text : false,
        icons: { primary: 'ui-icon-circlesmall-minus' },
        label : getText('track_contol_menu_remove_from_queue')
    }).click(function() {
        var args = { track_id    : parseInt(control_menu_descriptor.entry_id),
                     playlist_id : parseInt(control_menu_descriptor.playlist_id)
                   }
        aimp_manager.removeTrackFromPlayQueue(args,
                                              { on_exception : on_control_menu_command }
                                              );
    });
    
    var download_track_button = $('#' + control_menu_descriptor.download_track_button_id , control_menu_descriptor.nTr);
    download_track_button.button({
        text : false,
        icons: { primary: 'ui-icon-arrowthick-1-s' },
        label : getText('track_contol_menu_download_track')
    }).click(function() {
        var args = { track_id    : parseInt(control_menu_descriptor.entry_id),
                     playlist_id : parseInt(control_menu_descriptor.playlist_id)
                   }
        var uri = '/downloadTrack/playlist_id/' + args.playlist_id + '/track_id/' + args.track_id;
        window.location = uri; // start downloading.
    });
    
    // add updater to global list.
    var notifier_id = control_menu_descriptor.entry_id + '_' + control_menu_descriptor.playlist_id;
    control_menu_state_updaters[notifier_id] = { notifier : updateTrackControlMenu, control_menu_descriptor : control_menu_descriptor };
}

function updateTrackControlMenu(control_menu_descriptor) {
    // play/pause button
    var play_button = $('#' + control_menu_descriptor.play_button_id, control_menu_descriptor.nTr);
    var current_track_active = isCurrentTrackPlaying(control_menu_descriptor);
    $(play_button).button('option', {
                                        icons: {
                                            primary: current_track_active ? 'ui-icon-pause' : 'ui-icon-play'
                                        },
                                        label : getText(current_track_active ? 'track_contol_menu_pause' : 'track_contol_menu_play')
                                    }
    );
}

/* Returns array of descriptors for DataTables object. */
function getDataTablesColumnsDescriptors()
{
    var entry_fields = getDisplayedEntryFieldsFromCookie();
    var fields_descriptions = getEntryFieldsDescriptions();
    var columns_desc = [ { sName : 'id', bVisible : false } ]; // first field always id field, it has no caption and invisible
    for (field_index in entry_fields) {
        var field_settings = {  sName : entry_fields[field_index],
                                sTitle : fields_descriptions[entry_fields[field_index]]
        };

        if (entry_fields[field_index] == 'duration') { // use spec format of entry duration field.
            initDurationField(field_settings);
        } else if (entry_fields[field_index] == 'filesize') {
            initFileSizeField(field_settings);
        } else if (entry_fields[field_index] == 'bitrate') {
            initBitrateField(field_settings);
        } else if (entry_fields[field_index] == 'rating') {
            initRatingField(field_settings);
        }
        columns_desc.push( field_settings );
    }
    return columns_desc;
}

function initDurationField(field_settings) {
    /*
        oObj members:
            "iDataRow": iRow,
            "iDataColumn": iColumn,
            "aData": oSettings.aoData[iRow]._aData,
            "oSettings": oSettings
    */
    field_settings.fnRender = function ( oObj ) {
        var time_ms = oObj.aData[oObj.iDataColumn];
        return formatTime(time_ms);
    }
    // align in cell center.
    field_settings.sClass = 'center';
}

function initFileSizeField(field_settings) {
    field_settings.fnRender = function ( oObj ) {
        var size_in_bytes = oObj.aData[oObj.iDataColumn];
        return formatFileSize(size_in_bytes);
    }
    // align in cell center.
    field_settings.sClass = 'center';
}

function initBitrateField(field_settings) {
    // display units only in table header.
    field_settings.sTitle = field_settings.sTitle + ', ' + getText('kilobits_per_second');

    // align in cell center.
    field_settings.sClass = 'center';
}

function initRatingField(field_settings) {
    field_settings.fnRender = function ( oObj ) {
        var aimp_rating = oObj.aData[oObj.iDataColumn];
        var playlist_id = getPlaylistIdFromTableId(oObj.oSettings.sTableId);
        var track_id = oObj.aData[0];
        var div_id = 'track_rating_' + playlist_id + '_' + track_id;
        var star_name = 'rating_star_' +  playlist_id + '_' + track_id; // name must be unique since v4 of rating plugin.
        var html = '<div id="' + div_id + '">';
        for (var i = 1; i <= 5; i++) {
            html += '<input name="' + star_name + '" type="radio" class="rating_star" value="' + i + '"'
                    + (i == aimp_rating ? ' checked="true"' : '')
                    + '/>';
        }
        html += '</div>';
        return html;
    }
    // align in cell center.
    field_settings.sClass = 'center';
    field_settings.sWidth = (16 * 6) + 'px';
}

/* Deletes all playlists controls(jQuery UI Tabs) */
function deletePlaylistsControls()
{
    if ($playlists_tabs !== null) {
        $playlists_tables = {}; // clear
        $('#playlists > div').remove();
        
        $playlists_tabs.tabs('destroy'); // if tabs control is already created - destroy all tabs.
        $playlists_tabs = null;
        $('#playlists li').remove();
    }
}

function isPlaylistContentLoaded(playlist_id) {
    return $playlists_tables[getPlaylistTableID(playlist_id)] !== undefined;
}

function loadPlaylistContentIfNotLoadedYet(playlist_id)
{
    if ( !isPlaylistContentLoaded(playlist_id) ) {
        createEntriesControl(playlist_id);  
    }
}

/* create controls(jQuery UI Tabs) for list of playlists. */
function createPlaylistsControls(playlists)
{
    if ($playlists_tabs === null) {
        $playlists_tabs = $('#playlists').tabs({
            cookie: { expires: 1 } // store cookie for a day, without, it would be a session cookie
            // function 'select' will be assigned below,
            //                   it need to be set after all tabs creation and unselecting all tabs to avoid unexpected invocation.
        }); // initialization of Tabs control.
    }
        
    // actual addTab function: adds new tab using the input from the form above
    function addTab(id, label, tabContentHtml) {
        var tabTemplate = "<li><a href='#{href}'><span>#{label}</span></a></li>";
        var li = $( tabTemplate.replace( /#\{href\}/g, '#' + id ).replace( /#\{label\}/g, label ) );
            
        $playlists_tabs.find('.ui-tabs-nav').append(li);
        $playlists_tabs.append('<div id="'+ id + '">' + tabContentHtml + '</div>');
    } 
    
    // create tabs for each playlist.
    for(i = 0; i < playlists.length; ++i) {
        var playlist_id = 'playlist_' + playlists[i].id, // // we need to have unique ID to attach div to tab.
            tabContentHtml = createTemplateEntriesTable(playlists[i].id);
        addTab(playlist_id, playlists[i].title, tabContentHtml);    
    }
    
    $playlists_tabs.tabs('refresh');
    
    $playlists_tabs.on('tabsactivate',  function(event, $ui) { // load content of playlist on tab activation, if content is not loaded yet.
                                            var $panel = $ui.newPanel;
                                            loadPlaylistContentIfNotLoadedYet( getPlaylistIdFromTabId($panel.get(0).id) );
                                        }
                       );
        
    // force load playlist content due to issue with tab select event.
    var playlist_id = control_panel_state.playlist_id;
    if (playlist_id === 0) { // AIMP3 sends 0 if playlist is never played.
        if (playlists.length > 0) { 
            playlist_id = playlists[0].id;
        }
    }
    createEntriesControl(playlist_id);  
    gotoCurrentPlaylist(playlist_id);
}

/*
    Loads list of playlists form server and create tabs for each playlist into div with id 'playlists'.
    Each playlist use ajax request to get tracks(playlist entries).
*/
function loadPlaylists()
{
    var on_error = function (error, localized_error_message) {
        var msg = getText('error_playlists_loading')+ ' ' + getText('reason') + ': ' + localized_error_message;
        var $playlists_obj = $('#playlists');
        $('ul', $playlists_obj).append(msg);
        $playlists_obj.tabs({});
        return true; // means that we handled error.
    };

    aimp_manager.getPlaylists({ fields : ['id', 'title'] },
                              {
                                on_success : createPlaylistsControls,
                                on_exception : on_error,
                                on_complete : undefined
                              }
    );
}

function isCurrentTrackSourceRadio()
{
    return control_panel_state.hasOwnProperty('current_track_source_radio') && control_panel_state.current_track_source_radio;
}

/* Init control panel controls */
function initControlPanel()
{
    // common error handler for control panel actions.
    var on_control_panel_command = function(error, localized_message) {
        alert(localized_message);
    };

    // Note: all dynamic button's icons and labels will be set in updateControlPanel();

    $('#play').button({
        text: false
    }).click(function() {
        if ( isPlaybackActive() ) {
            aimp_manager.pause({}, { on_exception : on_control_panel_command }); // pause playback
        } else {
            aimp_manager.play({}, { on_exception : on_control_panel_command }); // start playback.
        }
    });

    $('#stop').button({
        text: false,
        icons: { primary: 'ui-icon-stop' },
        label: getText('control_panel_stop')
    }).click(function() {
        aimp_manager.stop({}, { on_exception : on_control_panel_command }); // stop playback
    });

    $('#previous').button({
        text: false,
        icons: { primary: 'ui-icon-triangle-1-w' },
        label: getText('control_panel_previous')
    }).click(function() {
        aimp_manager.playPrevious({}, { on_exception : on_control_panel_command }); // play previous track
    });

    $('#next').button({
        text: false,
        icons: { primary: 'ui-icon-triangle-1-e' },
        label : getText('control_panel_next')
    }).click(function() {
        aimp_manager.playNext({}, { on_exception : on_control_panel_command }); // play next track
    });

    $('#shuffle').button({
        text: false,
        icons: { primary: 'ui-icon-shuffle' }
    }).click(function() {
        aimp_manager.shufflePlaybackMode({ shuffle_on : !control_panel_state.shuffle_mode_on },
                                         { on_exception : on_control_panel_command }
        ); // activate/deactivate shuffle playback mode.
    });

    $('#repeat').button({
        text: false,
        icons: { primary: 'ui-icon-refresh' }
    }).click(function() {
        aimp_manager.repeatPlaybackMode({ repeat_on : !control_panel_state.repeat_mode_on },
                                        { on_exception : on_control_panel_command }
        ); // activate/deactivate repeat playback mode.
    });
    
     $('#radio_capture').button({
        text: false,
        icons: { primary: 'ui-icon-signal-diag' }
    }).click(
        function(event) {
            aimp_manager.radioCapture({ radio_capture_on : !control_panel_state.radio_capture_mode_on },
                                      { on_exception : on_control_panel_command }
            ); // activate/deactivate radio capture mode.                
        }
    );
    
    $('#show_settings_form').button({
        text: false,
        icons: { primary: 'ui-icon-wrench' },
        label : getText('control_panel_settings')
    }).click(
        function() {
            $('#settings-dialog-form').dialog('open');
        }
    );

    var mute_hover_handler = function () {
        $(this).toggleClass('ui-state-hover');
    }
    $('#mute_button').click(function () {
        aimp_manager.mute({ mute_on : !control_panel_state.mute_mode_on },
                          { on_exception : on_control_panel_command }
        ); // activate/deactivate mute mode.
    }).hover(mute_hover_handler, mute_hover_handler);

    $('#volume_slider').slider({
        value: control_panel_state.volume,
        min : 0,
        max : 100,
        orientation: 'horizontal',
        range: 'min',
        animate: true,
        stop: function(event, ui) {
            aimp_manager.volume({ level : ui.value },
                                { on_exception : on_control_panel_command }
            ); // set volume
        }
    });

    $('#control_panel_buttons').buttonset();
}

/* Update control panel page controls according to Aimp state. */
function updateControlPanel()
{
    var control_panel = control_panel_state; // used for easy debug in Dragonfly

    var play_button = $('#play');
    if (play_button[0].className == '') { // on first call we need to init all controls.
        initControlPanel();
    }

    // play/pause button
    var playing_now = isPlaybackActive();
    play_button.button('option', {
                                    icons: {
                                        primary: playing_now ? 'ui-icon-pause' : 'ui-icon-play'
                                    },
                                    label: getText(playing_now ? 'control_panel_pause' : 'control_panel_playback')
                                 }
    );

    // mute button
    var mute_button = $('#mute_button');
    var mute_icon = $('#mute_icon');
    if ( control_panel.mute_mode_on ) {
        mute_icon.removeClass('ui-icon-volume-on');
        mute_icon.addClass('ui-icon-volume-off');
        mute_button.prop( 'title', getText('control_panel_mute_off') );
    } else {
        mute_icon.removeClass('ui-icon-volume-off');
        mute_icon.addClass('ui-icon-volume-on');
        mute_button.prop( 'title', getText('control_panel_mute_on') );
    }

    // volume slider
    var volume_slider = $('#volume_slider');
    volume_slider.slider('value', control_panel.volume);
    volume_slider.prop('title',
               getText('control_panel_volume') + ' ' + control_panel.volume + '/100'
    );

    // shuffle button
    var shuffle_button = $('#shuffle');
    shuffle_button.button('option', {
                                        label: getText(control_panel.shuffle_mode_on ? 'control_panel_shuffle_off' : 'control_panel_shuffle_on')
                                    }
    );
    shuffle_button.prop('checked', control_panel.shuffle_mode_on);
    shuffle_button.button('refresh');

    // repeat button
    var repeat_button = $('#repeat');
    repeat_button.button('option',  {
                                        label: getText(control_panel.repeat_mode_on ? 'control_panel_repeat_off' : 'control_panel_repeat_on')
                                    }
    );
    repeat_button.prop('checked', control_panel.repeat_mode_on);
    repeat_button.button('refresh');
    
    // radio capture button
    var radio_capture_button = $('#radio_capture');
    var disable_radio_capture_button = !isCurrentTrackSourceRadio();
    radio_capture_button.button(disable_radio_capture_button ? 'disable' : 'enable');
    radio_capture_button.button('option', {
                                              label: getText(disable_radio_capture_button ? 'control_panel_radio_capture_disabled' :
                                                                                            control_panel_state.radio_capture_mode_on ? 'control_panel_radio_capture_off'
                                                                                                                                      : 'control_panel_radio_capture_on'
                                                             )
                                          }
    );
    radio_capture_button.prop('checked', !disable_radio_capture_button && control_panel_state.radio_capture_mode_on);
    if (disable_radio_capture_button) {
        radio_capture_button.button('widget').removeClass('ui-state-disabled');
    }
    radio_capture_button.button('refresh');
}

/*
    Updates state of Control Panel controls to be sync with Aimp.
*/
function updateControlPanelState(result) {
    control_panel_state = result; // update global variable.
    
    if (control_panel_state.playlist_id == 0) { // in case when track from removed playlist is playing.
        // TODO: ask about first available real playlist
        //control_panel_state.playlist_id = ;
        //control_panel_state.track_id = ;
    }
    
    updateControlPanel();
    syncronizeControlMenus();
    gotoCurrentTrackInPlaylist(true);
};

function getFormatOfTrackInfoFromCookies()
{
    var track_info_format_string = $.cookie('track-info-format-string');
    if (track_info_format_string !== null) {
        return track_info_format_string;
    }
    return '%IF(%a,%a - %T,%T)';
}

/* Updates state of Playback(current playback state and scrolling track info) Panel controls to be sync with Aimp. */
function updatePlaybackPanelState(control_panel_state)
{
    var $scroll_text_div = $('#scroll_current_track_container > div');
    if ( isPlaybackActive() ) {
        $('#playback_state_label').text( getText('playback_state_playing') );

        aimp_manager.getFormattedTrackTitle({
                                              track_id : control_panel_state.track_id,
                                              playlist_id : control_panel_state.playlist_id,
                                              format_string : getFormatOfTrackInfoFromCookies()
                                            },
                                            { on_success : function (result) {
                                                            //alert(result.formatted_string);
                                                            $scroll_text_div.text(result.formatted_string);
                                                           }

                                            }
        );
    } else {
        $('#playback_state_label').text( getText('playback_state_stopped') );
        $scroll_text_div.text('');
    }
    
    updateTrackProgressBarState(control_panel_state);
}

/* Updates state track progress bar controls to be sync with Aimp. */
function updateTrackProgressBarState(control_panel_state)
{
    var $track_progress_bar = $('#track_progress_bar');
    
    if ($track_progress_bar[0].className == '') { // first time initialization.
        $track_progress_bar.slider({ min : 0,
                                     max : control_panel_state.track_length,
                                     value : control_panel_state.track_position,
                                     animate : true,
                                     stop : function(event, ui) {
                                         aimp_manager.trackPosition({ position : ui.value },
                                                                    { on_exception : function(error, localized_message) {
                                                                                         alert(localized_message);
                                                                                     }
                                                                    }
                                         ); // set track position
                                     }
                                   });
    }
    
    if ( control_panel_state.hasOwnProperty('track_length') ) {
        setTrackProgressBarState($track_progress_bar, 'enabled');
        
        $track_progress_bar.slider('option', 'value', control_panel_state.track_position);
        $track_progress_bar.slider('option', 'max',   control_panel_state.track_length);
        
        updateTrackProgressBarHintText($track_progress_bar);
    } else {
        setTrackProgressBarState($track_progress_bar, 'disabled');
    }
}

// Activates or deactivates track progress bar.
function setTrackProgressBarState($track_progress_bar, state) {
    var enabled = (state === 'enabled');
    $('.ui-slider-handle', $track_progress_bar).css('visibility', enabled ? 'visible': 'hidden'); // we need to hide progress pointer, since progress has no sense.
    $track_progress_bar.slider('option', 'disabled', !enabled);
    
    if (track_progress_timer !== null) {
        window.clearInterval(track_progress_timer);
    }
    
    if (enabled) {
        if ( isPlaybackActive() ) {
            var refresh_time_ms = 1000;
            track_progress_timer = window.setInterval(function () {
                                                        var old_value_sec = $track_progress_bar.slider('option', 'value');
                                                        var new_value_sec = old_value_sec + refresh_time_ms / 1000;
                                                        $track_progress_bar.slider('option', 'value', new_value_sec);
                                                        updateTrackProgressBarHintText($track_progress_bar);
                                                      },
                                                      refresh_time_ms
                                                      );
        }
    } else {
        $track_progress_bar.prop('title', '');
    }
}

function updateTrackProgressBarHintText($track_progress_bar) {
    var progress_sec = $track_progress_bar.slider('option', 'value');
    var length_sec = $track_progress_bar.slider('option', 'max');
    $track_progress_bar.prop('title',
                             formatTime(progress_sec * 1000) // represent seconds as milliseconds.
                             + '/'
                             + formatTime(length_sec * 1000) // represent seconds as milliseconds.
                             ); 
}

/*
    Subscribe for control panel change event.
    Endless cycle, call only once at page loading.
*/
function subscribeOnControlPanelChangeEvent() {

    aimp_manager.subscribe( { event : 'control_panel_state_change' },
                            {   on_success : function(result) {
                                    updateControlPanelState(result);
                                    updatePlaybackPanelState(result);

                                    // update track info dialog content if dialog is opened.
                                    if ( isPlaybackActive() ) {
                                        var $track_info_dialog = $('#track_info_dialog');
                                        if ( $track_info_dialog.dialog('isOpen') ) {
                                            var dialog_position = $track_info_dialog.dialog('option', 'position');
                                            //$('#playback_panel_container').click();
                                            updateTrackInfoDialogContent({
                                                                          callback: function (point) {
                                                                            showTrackInfoDialogAtCoords(point.x, point.y);
                                                                          },
                                                                          param: { x: dialog_position[0], y: dialog_position[1] }
                                                                         });
                                        }
                                    }
                                },
                                on_exception : function(error, message) {
                                    alert(message + ', error code = ' + error.code);
                                }, // nothing to do in on_exception(), just try to subscribe again, on_complete() do it.
                                on_complete : subscribeOnControlPanelChangeEvent // will be called unconditionally.
                            }
    );
}

/*
    Subscribe for forced track position change event.
    Endless cycle, call only once at page loading.
*/
function subscribeOnTrackPositionChangeEvent() {

    aimp_manager.subscribe( { event : 'play_state_change' },
                            {   on_success : function(result) {                                   
                                    updateTrackProgressBarState(result);
                                },
                                on_exception : function(error, message) {
                                    alert(message + ', error code = ' + error.code);
                                }, // nothing to do in on_exception(), just try to subscribe again, on_complete() do it.
                                on_complete : subscribeOnTrackPositionChangeEvent // will be called unconditionally.
                            }
    );
}

/*
    Subscribe for playlists content change event.
    Endless cycle, call only once at page loading.
*/
function subscribeOnPlaylistsContentChangeEvent() {

    aimp_manager.subscribe( { event : 'playlists_content_change' },
                            {   on_success : function(result) {
                                    if (result.playlists_changed) {
                                        deletePlaylistsControls();
                                        loadPlaylists();
                                    }
                                },
                                on_exception : function(error, message) {
                                    alert(message + ', error code = ' + error.code);
                                }, // nothing to do in on_exception(), just try to subscribe again, on_complete() do it.
                                on_complete : subscribeOnPlaylistsContentChangeEvent // will be called unconditionally.
                            }
    );
}

/* Updates Aimp control panel state. Sync it with Aimp. */
function syncronizeControlPanelStateWithAimp()
{
    var on_error = function (error, localized_error_message) {
        var msg = getText('error_get_control_panel_state')+ ' ' + getText('reason') + ': ' + localized_error_message;
        alert(msg);
        return true; // means that we handled error.
    };

    aimp_manager.getControlPanelState(  {},
                                        {
                                          on_success : function(result) {
                                            updateControlPanelState(result);
                                            updatePlaybackPanelState(result);
                                          },
                                          on_exception : on_error,
                                          on_complete : undefined
                                        }
    );
}

/* Initialize all page controls. Function is called on after page loading.*/
function initAimpControlPage()
{
    localizePage();

    initTrackInfoDialog(); // this should be called before subscribing to syncronization with AIMP.
    subscribeOnControlPanelChangeEvent();
    syncronizeControlPanelStateWithAimp();
    subscribeOnPlaylistsContentChangeEvent();
    subscribeOnTrackPositionChangeEvent(); ///!!! this can be done on track playing start.
    initSettingsDialog();
    loadPlaylists();
    initPlaylistControls();
}

function makeMenu(id, items)
{
    var html = '<ul id="' + id + '">';
    for (var i in items) {
        var item = items[i];   
        var item_html = '<li id="' + item['id'] + '"><a href="#">' + getText(item['text_id']) + '</a></li>';
        html += item_html;
    }
    html += '</ul>';
    return html;
}

function removeMenu(menu)
{
    menu.menu('destroy');
    menu.remove();
}

function makeFileUploadHtml(id, upload_progress_id, playlist_id)
{
    var html =    '<table width="100%" >'
                    + '<tbody>'
                    + '<tr>'
                        + '<td>'
                            + '<p>' + getText('playlist_contol_dialog_file_add_message') + '</p>'
                            + '<span class="fileinput-button">'
                                + '<span>' + getText('playlist_contol_dialog_file_add_button_caption') + '</span>'
                                + '<input id="' + id + '" type="file" name="files[]" data-url="uploadTrack/playlist_id/' + playlist_id + '" multiple>'
                            + '</span>'
                        + '</td>'
                    + '</tr>'
                    + '<tr>'
                        + '<td>'
                            + '<div id="' + upload_progress_id + '">'
                                + '<div class="progress-label"></div>'
                            + '</div>'
                        + '</td>'
                    + '</tr>'
                    + '</tbody>'
                + '</table>'
    ;
    return html;
}

function removeFileUpload(fileupload)
{
    fileupload.fileupload('destroy');
    fileupload.remove();
}

function getActivePlaylistID()
{
    //var active_playlist_index = .tabs('option', 'active');
    var active_tab = $('.ui-tabs-active a', $playlists_tabs);
    var id = getPlaylistIdFromTabId(active_tab.attr('href'));
    return id;
}

function makeDialogHtml(dialog_id, title, inner_html) {
    var html =   '<div id="' + dialog_id + '" title="' + title + '">'
                    + inner_html
               + '</div>';
    return html;
}

function removeDialog(ctrl)
{
    ctrl.dialog('destroy');
    ctrl.remove();
}

function showFileUploadDialog()
{
    var dialog_id = 'fileupload_dialog';
    
    var control_id = 'fileupload';
    var upload_progress_id = 'file_upload_progress';
    
    $('#playlist_controls').append(
        makeDialogHtml( dialog_id,
                        getText('playlist_contol_dialog_file_add_title'),
                        makeFileUploadHtml(control_id, upload_progress_id, getActivePlaylistID())
        )
    );
    
    $('#playlist_controls').find('.fileinput-button').each(function () {
        var input = $(this).find('input:file').detach();
        $(this)
            .button({icons: {primary: 'ui-icon-plusthick'}})
            .append(input);
    });
    
    var progressbar = $('#' + upload_progress_id),
        progressLabel = $('.progress-label', progressbar);
 
    progressbar.progressbar({
        value: false,
        change: function() {
            progressLabel.text( progressbar.progressbar('value') + '%');
        },
        complete: function() {
            //progressLabel.text( "Complete!" );
        }
    });
    
    function cleanUp() {
        removeFileUpload($('#' + control_id));
        removeDialog($('#' + dialog_id));
        $('#' + upload_progress_id).progressbar('destroy');
    }
    
    $('#' + control_id).fileupload({
        singleFileUploads: false,
        sequentialUploads: true,
        multipart: true,
        done: function (e, data) {
        },
        fail: function (e, data) {
            alert('upload failure');
        },
        always: function (e, data) {
            cleanUp();
        },
        progressall: function (e, data) {
            var progress = parseInt(data.loaded / data.total * 100, 10);
            progressbar.progressbar('value', progress);
        }
    });
    
    $('#' + dialog_id).dialog({
        modal: true,
        close: function( event, ui ) {
            cleanUp();
        }
    });
}

function makeUrlUploadHtml(id)
{
    var html =  '<form id="' + id + '" action="" enctype="multipart/form-data" method="post">'
                    + '<p>'
                        + getText('playlist_contol_menu_item_add_url')
                        + '<br/>'
                        + '<input type="text" id="url" name="url" size="40">'
                    + '</p>'
                    + '<input class="button" type="submit" value="' + getText('playlist_contol_dialog_url_add_button_title') + '">'
              + '</form>';
    return html;
}

function showUrlUploadDialog()
{
    var dialog_id = 'url_upload_dialog';
    var form_id = 'url_upload_form';
    $('#playlist_controls').append(
        makeDialogHtml( dialog_id,
                        getText('playlist_contol_dialog_url_add_title'),
                        makeUrlUploadHtml(form_id)
        )
    );
    
    function cleanUp() {
        removeDialog($('#' + dialog_id));   
    }
    
    // post via ajax to avoid redirect to action page on form submit button click.
    $('#' + form_id + ' .button').click(function() {
        var url = $('input#url').val();
        aimp_manager.addURLToPlaylist(  { playlist_id: parseInt(getActivePlaylistID()),
                                          url: url
                                        },
                                        {
                                          on_success : undefined,
                                          on_exception : function(error, localized_error_message) {
                                            alert(localized_message);
                                          },
                                          on_complete : undefined
                                        }
        );
        cleanUp();
        return false;
    });

    $('#' + dialog_id).dialog({
        modal: true,
        close: function( event, ui ) {
            cleanUp();
        }
    });
}

function createPlaylistControlMenu(menu_id)
{    
    var items = [{id:'file', text_id: 'playlist_contol_menu_item_add_file'},
                 {id:'url',  text_id: 'playlist_contol_menu_item_add_url'}
                 ];
    
    // prepare menu.
    var playlist_controls = $('#playlist_controls');   
    playlist_controls.append(makeMenu(menu_id, items));
    
    var add_entity_menu = $('#' + menu_id);

    add_entity_menu.menu({
        select: function( event, ui ) {
            switch(ui.item[0].id) {
            case 'file':
                showFileUploadDialog();
                break;
            case 'url':
                showUrlUploadDialog();
                break;
            }
            removeMenu(add_entity_menu);
        }
    });    
}

function initPlaylistControls()
{
    // prepare button
    var add_entity_button = $('#add_entity_to_playlist_button');
    add_entity_button.button({
        text : false,
        icons: { primary: 'ui-icon-plusthick' },
        label : getText('playlist_contol_menu_add'),
        disabled : true
    }).click(function() {
        var menu_id = 'add_entity_to_playlist_menu';
        var add_entity_menu = $('#' + menu_id);
        if (add_entity_menu.length != 0) {
            removeMenu(add_entity_menu);
        } else {
            createPlaylistControlMenu(menu_id);        
        }        
    });
    
    aimp_manager.pluginCapabilities(
                                    {
                                      on_success : function(result) {
                                        if (result.hasOwnProperty('upload_track')) {
                                            if (result['upload_track']) {
                                                add_entity_button.button('option', 'disabled', false);
                                            } else {
                                                add_entity_button.button('option', 'label', getText('playlist_contol_menu_add_disabled'));
                                            }
                                        }
                                      },
                                      on_exception : function(error, localized_error_message) {
                                        // do nothing, menu will remain disabled.
                                        add_entity_button.button('option', 'label', getText('playlist_contol_menu_add_not_supported'));
                                      },
                                      on_complete : undefined
                                    }
    );
}


function initTrackInfoDialog()
{
    //$.fx.speeds._default = 1000;
    $('#track_info_dialog').dialog({
        autoOpen : false,
        minWidth : 300,
        width : 300
        //show: 'blind'
        //hide: 'explode'
    });
    $('#playback_panel_container').click(function(event) {
        updateTrackInfoDialogContent({
                                      callback: function (point) {
                                        if ( isPlaybackActive() ) {
                                            showTrackInfoDialogAtCoords(point.x, point.y);
                                        }
                                      },
                                      param: { x: event.pageX, y: event.pageY }
                                     }
        );
        return false;
    });

    function getTrackForRatingSet(rating_div) {
    return { 'playlist_id': control_panel_state.playlist_id,
         'track_id': control_panel_state.track_id
           };
    }   
    initStarRatingWidget('track_info_rating', getTrackForRatingSet);
}

/*
    Handles rating set to track by rating widget click.
    track_getter - function with one argument: rating widget element which was clicked.
           returns {'playlist_id': xx, 'track_id':xx} object that specifies track to set it's rating.
*/
function RatingChangeHandler(track_getter) {
    function onRatingWidgetClick(value, link) {
        var track_desc = track_getter(this);
        var playlist_id = track_desc.playlist_id;
        var track_id    = track_desc.track_id;

        aimp_manager.setTrackRating(  {
                        track_id: track_id,
                        playlist_id: playlist_id,
                        rating: (value !== undefined ? parseInt(value) // value range is [1, 5].
                                     : 0 // set 0 rating, for AIMP it means "rating is not set".
                             )
                      },
                      {
                        on_success : undefined,
                        on_exception : undefined,
                        on_complete : function (response) {
                                if ( $('#track_info_dialog').dialog('isOpen') ) {
                                updateTrackInfoDialogContent({
                                    callback: function (param) {},
                                    param: {}
                                });
                                }
                             }
                      }
        );
    }

    return onRatingWidgetClick;
}

/*
    Init star rating widget.
    track_getter - function with one argument: rating widget element which was clicked.
           returns {'playlist_id': xx, 'track_id':xx} object that specifies track to set it's rating.
    Returns rating widget.
*/
function initStarRatingWidget(div_id, track_getter)
{
    return $('#' + div_id + ' .rating_star').rating({
        callback: RatingChangeHandler(track_getter),
        cancel: getText('track_info_dialog_cancel_rating'),
        cancelValue: 0
    });
}

function setRatingWidgetValue(div_id, value)
{
    $('#' + div_id + ' .rating_star').rating('select',
                                             value,
                                             false // do not invoke callback on 'select'
                                             );
}

function resetRatingWidgetValue(div_id)
{
    $('#' + div_id + ' .rating_star').rating('drain');
}

/* Shows dialog in position (coordX, coordY) on page. */
function showTrackInfoDialogAtCoords(coordX, coordY)
{
    var $track_info_dialog = $('#track_info_dialog');
    $track_info_dialog.dialog('option', 'position', [coordX, coordY]);
    $track_info_dialog.dialog('open');
}

/*
    Update content of track info dialog.
    On success calls on_success_callback_descriptor.callback function with param on_success_callback_descriptor.param.
*/
function updateTrackInfoDialogContent(on_success_callback_descriptor) {
    aimp_manager.getTrackInfo(  {
                                  track_id : control_panel_state.track_id,
                                  playlist_id : control_panel_state.playlist_id
                                },
                                {
                                  on_success : function(track_info) {
                                    fillTrackInfoTable(track_info);
                                    on_success_callback_descriptor.callback(on_success_callback_descriptor.param)
                                  },
                                  on_exception : undefined,
                                  on_complete : undefined
                                }
    );
}

/* Fill table with info about track. */
function fillTrackInfoTable(track_info)
{
    function setFieldText(track_field)
    {
        $('#track_info_' + track_field).text(track_info[track_field]);
    }

    var text_track_fields = getSupportedTrackFields();

    var filesize_field = 'filesize';
    removeElementFromArrayByValue(text_track_fields, filesize_field);
    $('#track_info_' + filesize_field).text( formatFileSize(track_info[filesize_field]) );

    var bitrate_field = 'bitrate';
    removeElementFromArrayByValue(text_track_fields, bitrate_field);
    $('#track_info_' + bitrate_field).text( track_info[bitrate_field] + ' ' +getText('kilobits_per_second') );

    var duration_field = 'duration';
    removeElementFromArrayByValue(text_track_fields, duration_field);
    $('#track_info_' + duration_field).text( formatTime(track_info[duration_field]) );

    var rating_field = 'rating';
    removeElementFromArrayByValue(text_track_fields, rating_field);
    var rating_value = track_info[rating_field];
    if (0 <= rating_value && rating_value <= 5) {
        if (rating_value > 0) {
            // set rating.
            setRatingWidgetValue('track_info_rating', rating_value - 1); // AIMP rating is in range [0(not set), 5(max rating)]. But we must use range [0, 4] for this control.
        } else {
            resetRatingWidgetValue('track_info_rating');
        }
    }

    // text fields without processing.
    for (field in text_track_fields) {
        setFieldText(text_track_fields[field]);
    }
}

/* Init static l10n string on page here. */
function localizePage()
{
    // init page title
    document.title = getText('page_title');

    // init settings dialog
    $('#settings-dialog-form').prop( 'title', getText('settings_dialog_title') );
    $('#settings-dialog-tab-playlistview-label').text( getText('settings_dialog_playlist_view_tab_title') );
    $('#settings-dialog-tab-language-label').text( getText('settings_dialog_language_tab_title') );
    $('#settings-dialog-tab-trackinfo-label').text( getText('settings_dialog_trackinfo_tab_title') );

    $('#entry_fields_label_show').text( getText('settings_dialog_playlist_view_tab_show_fields') );
    $('#entry_fields_label_hide').text( getText('settings_dialog_playlist_view_tab_hide_fields') );

    $('#track-title-format').text( getText('settings_dialog_trackinfo_format') );

    localizeTrackInfoDialog();
}

/* Fill labels of track info dialog. */
function localizeTrackInfoDialog()
{
    // dialog caption
    $('#track_info_dialog').prop( 'title', getText('track_info_dialog_caption') );

    // field labels
    function setLabelText(track_field)
    {
        $('#label_track_info_' + track_field).text( getText('entry_field_caption_' + track_field) + ': ' );
    }

    var all_track_fields = getSupportedTrackFields();
    for (field in all_track_fields) {
        setLabelText(all_track_fields[field]);
    }
}

/* Returns array of entry fields. */
function getDisplayedEntryFieldsFromCookie()
{
    var entry_fields_string = $.cookie('view-entry-fields');
    if (entry_fields_string == null) {
        return ['title']; // by default return title.
    }

    return entry_fields_string.split(',');
}

/*
    Returns HTML code of table of playlist entries.
    Table has id='entries_table_' + playlist_id
*/
function createTemplateEntriesTable(playlist_id)
{
    var table_columns = ['id'].concat( getDisplayedEntryFieldsFromCookie() ); // first column always id
    var table_html = '\
    <table id="entries_table_' + playlist_id + '" class="display" cellpadding="0" cellspacing="0" border="0" width="100%">\
    <thead>\
        <tr>'
    +
        array_join('<th>', table_columns, '</th>')
    +
    '\
        </tr>\
    </thead>\
    <tbody></tbody>\
    </table>';
//    <tfoot>\
//        <tr>'
//    +
//        array_join('<th>', table_columns, '</th>')
//    +
//    '\
//        </tr>\
//    </tfoot>';

    return table_html;
}

/*
    Joins array of strings in string like this: "'left_part'element'right_part'".
    Example:
            Arguments:
                left_part = '<th>'
                array = new Array('1', '2')
                right_part = '</th>'
            Result: '<th>1</th><th>2</th>'
*/
function array_join(left_part, array, right_part)
{
    return left_part + array.join(right_part + left_part) + right_part;
}

/* Returns string array of entry fields. */
function getSupportedTrackFields()
{
    return new Array('title', 'artist', 'album', 'date', 'genre', 'bitrate', 'duration', 'filesize', 'rating'); //, 'albumcover'
}

/* Remove first equal element from array. */
function removeElementFromArrayByValue(array, value)
{
    for (index in array) {
        if (array[index] === value) {
            array.splice(index, 1);
            return;
        }
    }
}

/*
    Represents time in milliseconds as 'hour : minute : second'.
*/
function formatTime(input_time_ms) {
    var input_time_sec = input_time_ms / 1000;

    var time_hour = (input_time_sec / 3600) | 0;
    var time_min = ( (input_time_sec % 3600) / 60 ) | 0;
    var time_sec = (input_time_sec % 60) | 0;

    function padout(number) {
        return (number < 10) ? '0' + number : number;
    }

    var delimeter = ':';

    return  (
             (time_hour > 0) ? (padout(time_hour) + delimeter)
                             : ''
            ) // show hours if hour is non-zero.
            + padout(time_min)
            + delimeter
            + padout(time_sec);
}

/* Represents file size in bytes as MB or KB. */
function formatFileSize(size_in_bytes) {
    var megabyte = 1048576;
    if (size_in_bytes > megabyte) {
        return (size_in_bytes / megabyte).toFixed(2) + ' MB';
    } else {
        return (size_in_bytes / 1024).toFixed(2) + ' KB';
    }
}