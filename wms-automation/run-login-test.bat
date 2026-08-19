@echo off
cd /d "%~dp0"
call mvn "-Denv=stg" "-Dsuite.name=login-tc001-only.xml" test
pause
