# Cross-platform script to build clingo static libraries from the submodule.
# Invoked via: cmake -P scripts/build-clingo.cmake

get_filename_component(ROOT_DIR "${CMAKE_CURRENT_LIST_DIR}/.." ABSOLUTE)

set(SOURCE_DIR "${ROOT_DIR}/external/clingo")
set(BUILD_DIR  "${SOURCE_DIR}/build")
set(INSTALL_DIR "${SOURCE_DIR}/install")

if(NOT EXISTS "${BUILD_DIR}/CMakeCache.txt")
  message(STATUS "Configuring clingo...")
  execute_process(
    COMMAND "${CMAKE_COMMAND}"
      "-S${SOURCE_DIR}"
      "-B${BUILD_DIR}"
      "-DCMAKE_BUILD_TYPE=Release"
      "-DCMAKE_INSTALL_PREFIX=${INSTALL_DIR}"
      "-DCMAKE_INSTALL_LIBDIR=lib"
      "-DCLINGO_BUILD_SHARED=Off"
      "-DCLINGO_BUILD_APPS=Off"
      "-DCLINGO_BUILD_WITH_PYTHON=Off"
      "-DCLINGO_BUILD_WITH_LUA=Off"
      "-DCMAKE_POSITION_INDEPENDENT_CODE=On"
    RESULT_VARIABLE result
  )
  if(NOT result EQUAL 0)
    message(FATAL_ERROR "cmake configure step failed")
  endif()
else()
  message(STATUS "Clingo already configured, skipping configure step.")
endif()

message(STATUS "Building clingo...")
execute_process(
  COMMAND "${CMAKE_COMMAND}" --build "${BUILD_DIR}" --parallel
  RESULT_VARIABLE result
)
if(NOT result EQUAL 0)
  message(FATAL_ERROR "cmake build step failed")
endif()

message(STATUS "Clingo static libraries built successfully.")
