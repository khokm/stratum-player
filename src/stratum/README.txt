------ Объяснение структуры каталогов и зависимостей модулей. ------

 - helpers - независимый каталог. Функции отсюда могут быть вполне использованы в
других проектах.
 - fileFormats - зав. от helpers. Описания форматов файлов, функции их чтения.
 - common - зав. от helpers,fileFormats. Различные зависимости других модулей.

 - compiler - компилятор, зависит от common,fileFormats,helpers.
 - classLibrary - библиотека имиджей, зависит от вышеперечисленного.
 - project - Проект и вычисляемая схема, зависит от вышеперечисленного и api (в плане файловой системы).

 - graphics - графика, зависит от common,fileFormats,helpers;

