@echo off
setlocal ENABLEDELAYEDEXPANSION

call build_plugin.bat || goto ERROR_HANDLER

:: Notice that variables TEMP_BUILD_DIR and CLIENT_SRC_RELEASE_DIR are set in build_plugin.bat script.

set PROJECT_VERSION_FILE=version.txt
set ARCHIVER=tools\7zip\7z

:CREATE_ARCHIVE
    echo Creating archive...
    set /p PROJECT_VERSION_TEMP= < %PROJECT_VERSION_FILE% || set PROJECT_VERSION_TEMP=unknown_version
    set PROJECT_VERSION=!PROJECT_VERSION_TEMP:.=_!
    set FULLPATH_ZIP=%TEMP_BUILD_DIR%\aimp_control_plugin_!PROJECT_VERSION!.7z
    
    :: add htdocs
    %ARCHIVER% a -t7z !FULLPATH_ZIP! ^
             .\%CLIENT_SRC_RELEASE_DIR% || goto ERROR_HANDLER
    :: and plugin DLL
    %ARCHIVER% a -t7z !FULLPATH_ZIP! ^
             .\%TEMP_BUILD_DIR%\aimp_control_plugin.dll || goto ERROR_HANDLER         
    :: and default settings.dat
    copy /Y .\inno_setup_data\default_settings.dat .\%TEMP_BUILD_DIR%\settings.dat || goto ERROR_HANDLER 
    %ARCHIVER% a -t7z !FULLPATH_ZIP! ^
             .\%TEMP_BUILD_DIR%\settings.dat || goto ERROR_HANDLER             
    :: and Readme.dat
    copy /Y .\HowToSetupPluginFrom7zPackage.txt .\%TEMP_BUILD_DIR%\Readme.txt || goto ERROR_HANDLER 
    %ARCHIVER% a -t7z !FULLPATH_ZIP! ^
             .\%TEMP_BUILD_DIR%\Readme.txt || goto ERROR_HANDLER
echo Archive created.
exit /B


:ERROR_HANDLER
    set ORIGINAL_ERROR_LEVEL=%ERRORLEVEL%
    echo Archive creation failed. Error code %ORIGINAL_ERROR_LEVEL%
    exit /B %ORIGINAL_ERROR_LEVEL%