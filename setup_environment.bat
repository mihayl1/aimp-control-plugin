:: setup paths of all tools used in plugin build process.

rem call "c:\Program Files\Microsoft Visual Studio 9.0\VC\bin\vcvars32.bat"
rem call "c:\Program Files\Microsoft Visual Studio 10.0\VC\bin\vcvars32.bat"
call "c:\Program Files (x86)\Microsoft Visual Studio 10.0\VC\vcvarsall.bat"

:: java runtime is used by yui_compressor and google closure compiler in MINIMIZE_CLIENT_SRC task. Currently jre7 does not work in pair with python scripts, so use jre6. 
set JAVA_HOME=c:\Program Files\Java\jdk1.6.0_32

set SUBWCREV_TOOL_DIR=c:\Program Files\TortoiseSVN\bin
set INNO_SETUP_HOME=c:\Program Files (x86)\Inno Setup 5
set PATH=%JAVA_HOME%\bin;%SUBWCREV_TOOL_DIR%;%INNO_SETUP_HOME%;%PATH%

:: following variables are used for source indexing and storing debug symbols to symbol server.
set PERL_DIR=c:\Perl64
::set DEBUG_TOOL_DIR=c:\Program Files\Debugging Tools for Windows (x86)
set DEBUG_TOOL_DIR=c:\Program Files (x86)\Windows Kits\8.0\Debuggers\x64
set SRCSRV_HOME=%DEBUG_TOOL_DIR%\srcsrv
set SVN_CLIENT_DIR=c:\Program Files (x86)\Subversion\bin
set PATH=%DEBUG_TOOL_DIR%;%SRCSRV_HOME%;%PERL_DIR%\bin;%SVN_CLIENT_DIR%\bin;%PATH%
set SYMBOL_STORE=C:\Symbols

:: following variables are used for documentation generation.
set DOXYGEN_PATH=c:\Program Files\doxygen\bin
set PATH=%DOXYGEN_PATH%;%PATH%