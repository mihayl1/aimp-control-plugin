It's recommended to use Settings Manager instead manual edit. To open it go to AIMP options->Plugins->Addons then press gear button on Control plugin.

## Settings file location ##
All plugin settings are stored in XML file "settings.dat" which is located by default in AIMP Plugins directory.
  * <AIMP dir>\Plugins\Control Plugin\settings.dat

Note: plugin versions 1.0.7.825 and older store setting in AIMP Profile directory. You can copy path and open it in any text editor.
  * for AIMP2 - "%USERPROFILE%\AppData\Roaming\AIMP\Control Plugin\settings.dat".
  * for AIMP3 - "%USERPROFILE%\AppData\Roaming\AIMP3\Control Plugin\settings.dat".

## Description of each setting ##
Each aspect of plugin work has it's own tag. Currently there are following root settings:
  * HTTP server
  * miscellaneous
  * plugin logger

### HTTP server settings ###
  * ip\_to\_bind
> You can tune network interface where plugin will start server. By default only server is stared on localhost only, so it is not accessible from other computers in network. You can specify IP address of network interface or, if you want plugin to be available from all interfaces, you can use empty string instead address(for ex.: `<ip_to_bind></ip_to_bind>`).

  * port
> Port that the server will listen.

  * document\_root
> Full path to browser scripts directory.

  * init\_cookies (Available in 1.0.7.864+)
> Cookies which are sent to client if client request does not contain any cookie.
> Can be used for setup view of main page different from default values.

> Example:

```

<init_cookies>

<!-- possible language values are: en,ru. -->
<cookie>language=en

Unknown end tag for &lt;/cookie&gt;



<!-- possible view-entry-fields values are: title,album,rating,artist,date,filesize,duration,genre,bitrate. -->
<cookie>view-entry-fields=title,artist,rating

Unknown end tag for &lt;/cookie&gt;





Unknown end tag for </init\_cookies>


```

### Miscellaneous ###
  * enable\_track\_upload (Available in 1.0.9.1125+)
> Controls ability to add files/URL to playlist. Turned off by default.

  * enable\_physical\_track\_deletion (Available in 1.0.11.1170+)
> Controls ability to physically delete tracks from file system. Turned off by default.

### Logger settings ###
  * directory
> Directory where logs are saved. This path is relative to "settings.dat" file path.
> On each launch plugin uses separate log file. Old logs are moved to "logs" subdirectory.

  * severity
> Logger severity. There are 5 levels of severity: debug, info, warning, error, critical. So debug level allows all log messages to be output in log, critical level outputs no messages except messages about critical errors in plugin.
> To disable log you can set severity to "none".

  * modules
> Contains names of all plugin's modules for which log is enabled for.
> Modules names are: plugin, aimp\_manager, http\_server, rpc\_server.