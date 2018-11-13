agamamatch=`expr match "$(pwd)" '.*\([Aa]gama\)'`
if [[ -z $agamamatch ]]
then
    git clone --recursive https://github.com/KomodoPlatform/Agama
    cd Agama
fi

git checkout dev
./binary_artifacts.sh
npm install
cd gui
git clone https://github.com/KomodoPlatform/EasyDEX-GUI
cd EasyDEX-GUI/react
git checkout dev
npm install
